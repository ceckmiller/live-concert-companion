"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { artists, concerts, tours } from "./db/schema";
import {
  concertSlug,
  formatGermanDate,
  formatWeekdayTime,
  setlistFmSearchUrl,
  slugify,
} from "./slug";
import { parsePosterCropJson, serializePosterCropJson, type PosterCrop } from "./poster-crop";
import {
  isAllowedPosterUpload,
  isValidPosterPath,
  posterTitleFromFilename,
  posterUploadExtension,
} from "./poster-upload";
import { hasWritableAppDataDir } from "./runtime-env";
import { saveUserPosterOverride } from "./user-poster-overrides";

export type CreateConcertResult = {
  artistSlug: string;
  concertSlug: string;
  setlistFmUrl: string;
  weekdayTime: string;
};

export type PosterCandidate = {
  url: string;
  title: string;
  width: number;
  height: number;
  score: number;
};

function revalidateConcertPaths(artistSlug: string) {
  revalidatePath("/");
  revalidatePath(`/artist/${artistSlug}`);
  revalidatePath("/admin");
}

async function findArtistBySlug(artistSlug: string) {
  const db = getDb();
  const artist = (
    await db.select().from(artists).where(eq(artists.slug, artistSlug)).limit(1)
  )[0];
  if (!artist) throw new Error("Künstler nicht gefunden");
  return { db, artist };
}

async function findConcertBySlugs(artistSlug: string, concertSlugValue: string) {
  const { db, artist } = await findArtistBySlug(artistSlug);
  const concert = (
    await db
      .select()
      .from(concerts)
      .where(and(eq(concerts.artistId, artist.id), eq(concerts.slug, concertSlugValue)))
      .limit(1)
  )[0];
  if (!concert) throw new Error("Konzert nicht gefunden");
  return { db, artist, concert };
}

export async function searchConcertPosters(input: {
  artistName: string;
  tourName: string;
  city: string;
  year: string;
  searchQuery?: string;
}): Promise<PosterCandidate[]> {
  const artistName = input.artistName.trim();
  const tourName = input.tourName.trim() || artistName;
  const city = input.city.trim();
  const year = input.year.trim();
  const searchQuery = input.searchQuery?.trim() ?? "";
  if (!artistName) throw new Error("Künstlername fehlt");

  const { searchTourPosterCandidates } = await import("../../scripts/tour-poster-search.mjs");
  return searchTourPosterCandidates(artistName, tourName, year, city, 10, searchQuery);
}

export async function uploadConcertPosterFile(
  formData: FormData,
): Promise<{ url: string; title: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Keine Datei ausgewählt");
  if (!isAllowedPosterUpload(file.type, file.size)) {
    throw new Error("Ungültiges Bild (JPG, PNG, WebP oder GIF, max. 10 MB)");
  }
  if (!hasWritableAppDataDir()) {
    throw new Error(
      "Datei-Upload ist online nicht verfügbar. Bitte ein Plakat per Suche oder externe URL wählen.",
    );
  }

  const ext = posterUploadExtension(file.type, file.name);
  const filename = `${crypto.randomUUID()}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "posters", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));

  return {
    url: `/posters/uploads/${filename}`,
    title: posterTitleFromFilename(file.name),
  };
}

export async function setConcertPoster(input: {
  artistSlug: string;
  concertSlug: string;
  posterUrl: string;
  posterTitle?: string;
  tourName?: string;
  posterCrop?: PosterCrop | null;
}): Promise<void> {
  const posterUrl = input.posterUrl.trim();
  if (!isValidPosterPath(posterUrl)) throw new Error("Ungültige Poster-URL");

  const { db, artist, concert } = await findConcertBySlugs(input.artistSlug, input.concertSlug);
  const tourName = (input.tourName || concert.tourName || artist.name).trim();
  const posterLabel = input.posterTitle?.trim()
    ? `Tourplakat: ${input.posterTitle.trim()}`
    : `Tourplakat: ${tourName}`;
  const posterCropJson =
    input.posterCrop === undefined && posterUrl === concert.posterPath
      ? concert.posterCropJson
      : serializePosterCropJson(input.posterCrop);

    await db
    .update(concerts)
    .set({ posterPath: posterUrl, posterLabel, tourName, posterCropJson })
    .where(eq(concerts.id, concert.id));

  saveUserPosterOverride(concert.slug, {
    posterPath: posterUrl,
    posterLabel,
    posterCropJson,
  });

  const existingTour = (
    await db
      .select()
      .from(tours)
      .where(and(eq(tours.artistId, artist.id), eq(tours.name, tourName)))
      .limit(1)
  )[0];

  if (existingTour) {
    await db
      .update(tours)
      .set({ posterPath: posterUrl, label: posterLabel, kind: "poster" })
      .where(eq(tours.id, existingTour.id));
  } else {
    await db.insert(tours).values({
      id: crypto.randomUUID(),
      artistId: artist.id,
      name: tourName,
      posterPath: posterUrl,
      label: posterLabel,
      kind: "poster",
    });
  }

  revalidateConcertPaths(artist.slug);
}

export async function deleteConcert(artistSlug: string, concertSlugValue: string): Promise<void> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  await db.delete(concerts).where(eq(concerts.id, concert.id));
  revalidateConcertPaths(artist.slug);
}

export async function createConcert(formData: FormData): Promise<CreateConcertResult> {
  const artistName = String(formData.get("artistName") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const venue = String(formData.get("venue") || "Berlin").trim();
  const city =
    String(formData.get("city") || (venue.toLowerCase().includes("berlin") ? "Berlin" : "")).trim() ||
    "Berlin";
  const time = String(formData.get("time") || "20:00").trim();
  const tourName = String(formData.get("tourName") || artistName).trim() || artistName;
  const posterUrl = String(formData.get("posterUrl") || "").trim();
  const posterTitle = String(formData.get("posterTitle") || "").trim();
  const posterCropJson = serializePosterCropJson(
    parsePosterCropJson(String(formData.get("posterCropJson") || "")),
  );

  if (!artistName || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Künstler und Datum (YYYY-MM-DD) sind erforderlich");
  }

  const db = getDb();
  const slug = slugify(artistName);
  let artist = (
    await db.select().from(artists).where(eq(artists.slug, slug)).limit(1)
  )[0];

  if (!artist) {
    const id = crypto.randomUUID();
    await db.insert(artists).values({
      id,
      slug,
      name: artistName,
      createdAt: new Date().toISOString(),
    });
    artist = (await db.select().from(artists).where(eq(artists.id, id)).limit(1))[0];
  }

  const cSlug = concertSlug(city, date);
  const dateLabel = formatGermanDate(date);
  const setlistFm = setlistFmSearchUrl(artistName, city, date);
  const note = `Eingetragen: ${formatWeekdayTime(date, time)}`;
  const posterLabel = posterTitle ? `Tourplakat: ${posterTitle}` : posterUrl ? `Tourplakat: ${tourName}` : null;
  const posterPath = isValidPosterPath(posterUrl) ? posterUrl : null;

  const existing = await db
    .select()
    .from(concerts)
    .where(eq(concerts.artistId, artist.id))
    .then((rows) => rows.find((r) => r.slug === cSlug));

  if (!existing) {
    await db.insert(concerts).values({
      id: crypto.randomUUID(),
      artistId: artist.id,
      slug: cSlug,
      sortDate: date,
      dateLabel,
      city,
      venue,
      tourName,
      note,
      posterPath,
      posterCropJson,
      posterLabel,
      setlistFmUrl: setlistFm,
      createdAt: new Date().toISOString(),
    });
  } else {
    await db
      .update(concerts)
      .set({
        sortDate: date,
        dateLabel,
        city,
        venue,
        tourName,
        note,
        setlistFmUrl: setlistFm,
        posterPath: posterPath ?? existing.posterPath,
        posterCropJson: posterPath ? posterCropJson : existing.posterCropJson,
        posterLabel: posterLabel ?? existing.posterLabel,
      })
      .where(eq(concerts.id, existing.id));
  }

  if (posterPath) {
    const existingTour = (
      await db
        .select()
        .from(tours)
        .where(and(eq(tours.artistId, artist.id), eq(tours.name, tourName)))
        .limit(1)
    )[0];
    if (existingTour) {
      await db
        .update(tours)
        .set({ posterPath, label: posterLabel || `Tourplakat: ${tourName}`, kind: "poster" })
        .where(eq(tours.id, existingTour.id));
    } else {
      await db.insert(tours).values({
        id: crypto.randomUUID(),
        artistId: artist.id,
        name: tourName,
        posterPath,
        label: posterLabel || `Tourplakat: ${tourName}`,
        kind: "poster",
      });
    }
  }

  revalidateConcertPaths(artist.slug);

  return {
    artistSlug: artist.slug,
    concertSlug: cSlug,
    setlistFmUrl: setlistFm,
    weekdayTime: formatWeekdayTime(date, time),
  };
}
