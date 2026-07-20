"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { artists, concerts, concertVideos, recordings, setlistItems, tours } from "./db/schema";
import {
  formatGermanDate,
  formatWeekdayTime,
  catalogConcertSlug,
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
import { fetchSetlistFromSetlistFm } from "./setlist-fm-fetch";
import { saveUserPosterOverride } from "./user-poster-overrides";
import {
  isAllowedVideoUpload,
  isValidVideoPath,
  videoUploadExtension,
} from "./video-upload";

export type CreateConcertResult = {
  artistSlug: string;
  concertSlug: string;
  setlistFmUrl: string;
  weekdayTime: string;
  posterFound: boolean;
  hadPosterFromForm: boolean;
};

export type EnrichSetlistResult = {
  songsFound: number;
  setlistFmUrl: string | null;
  songs: string[];
};

export type EnrichVideosResult = {
  songsMissing: string[];
  videosFound: number;
};

export type UpdateConcertResult = {
  artistSlug: string;
  concertSlug: string;
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

export async function setConcertHidden(
  artistSlug: string,
  concertSlugValue: string,
  hidden: boolean,
): Promise<void> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  await db.update(concerts).set({ hidden }).where(eq(concerts.id, concert.id));
  revalidateConcertPaths(artist.slug);
}

async function applyPosterToConcert(input: {
  db: ReturnType<typeof getDb>;
  artist: { id: string; slug: string };
  concert: { id: string; tourName: string | null };
  posterPath: string;
  posterLabel: string;
  tourName: string;
}) {
  await input.db
    .update(concerts)
    .set({ posterPath: input.posterPath, posterLabel: input.posterLabel, tourName: input.tourName })
    .where(eq(concerts.id, input.concert.id));

  const existingTour = (
    await input.db
      .select()
      .from(tours)
      .where(and(eq(tours.artistId, input.artist.id), eq(tours.name, input.tourName)))
      .limit(1)
  )[0];

  if (existingTour) {
    await input.db
      .update(tours)
      .set({ posterPath: input.posterPath, label: input.posterLabel, kind: "poster" })
      .where(eq(tours.id, existingTour.id));
  } else {
    await input.db.insert(tours).values({
      id: crypto.randomUUID(),
      artistId: input.artist.id,
      name: input.tourName,
      posterPath: input.posterPath,
      label: input.posterLabel,
      kind: "poster",
    });
  }
}

export async function enrichConcertSetlist(
  artistSlug: string,
  concertSlugValue: string,
): Promise<EnrichSetlistResult> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  const fetched = await fetchSetlistFromSetlistFm({
    artistName: artist.name,
    city: concert.city,
    date: concert.sortDate,
    venue: concert.venue,
  });

  if (fetched.songs.length) {
    await db.delete(setlistItems).where(eq(setlistItems.concertId, concert.id));
    for (let i = 0; i < fetched.songs.length; i++) {
      await db.insert(setlistItems).values({
        concertId: concert.id,
        position: i + 1,
        songTitle: fetched.songs[i],
      });
    }
  }

  if (fetched.setlistFmUrl) {
    await db
      .update(concerts)
      .set({ setlistFmUrl: fetched.setlistFmUrl })
      .where(eq(concerts.id, concert.id));
  }

  revalidateConcertPaths(artist.slug);
  return {
    songsFound: fetched.songs.length,
    setlistFmUrl: fetched.setlistFmUrl,
    songs: fetched.songs,
  };
}

export async function enrichConcertPoster(
  artistSlug: string,
  concertSlugValue: string,
): Promise<{ posterFound: boolean }> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  if (concert.posterPath) {
    return { posterFound: true };
  }

  const year = concert.sortDate.slice(0, 4);
  const tourName = concert.tourName || artist.name;
  const { searchTourPosterCandidates } = await import("../../scripts/tour-poster-search.mjs");
  const candidates = await searchTourPosterCandidates(
    artist.name,
    tourName,
    year,
    concert.city,
    5,
  );

  if (!candidates[0]?.url) {
    revalidateConcertPaths(artist.slug);
    return { posterFound: false };
  }

  const posterLabel = `Tourplakat: ${candidates[0].title}`;
  await applyPosterToConcert({
    db,
    artist,
    concert,
    posterPath: candidates[0].url,
    posterLabel,
    tourName,
  });

  revalidateConcertPaths(artist.slug);
  return { posterFound: true };
}

export async function listConcertSongsMissingVideos(
  artistSlug: string,
  concertSlugValue: string,
): Promise<{ songs: string[]; missing: string[] }> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  void artist;
  const setlist = (
    await db
      .select()
      .from(setlistItems)
      .where(eq(setlistItems.concertId, concert.id))
      .orderBy(asc(setlistItems.position))
  ).map((row) => row.songTitle);

  const existingVideos = await db
    .select()
    .from(concertVideos)
    .where(eq(concertVideos.concertId, concert.id));
  const have = new Set(existingVideos.map((v) => v.songTitle));
  const missing = setlist.filter((song) => !have.has(song));
  return { songs: setlist, missing };
}

export async function enrichConcertVideoSong(
  artistSlug: string,
  concertSlugValue: string,
  songTitle: string,
): Promise<{ found: boolean; url?: string }> {
  const song = songTitle.trim();
  if (!song) throw new Error("Songtitel fehlt");

  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  const { findSongVideo } = await import("../../scripts/search-concert-youtube.mjs");
  const url = await findSongVideo({
    concertId: concert.slug,
    artistName: artist.name,
    city: concert.city,
    venue: concert.venue,
    sort: concert.sortDate,
    song,
  });

  if (!url) {
    return { found: false };
  }

  await db
    .insert(concertVideos)
    .values({ concertId: concert.id, songTitle: song, url })
    .onConflictDoUpdate({
      target: [concertVideos.concertId, concertVideos.songTitle],
      set: { url },
    });

  revalidateConcertPaths(artist.slug);
  return { found: true, url };
}

export async function enrichConcertRecordings(
  artistSlug: string,
  concertSlugValue: string,
): Promise<{ recordingsFound: number }> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  const existing = await db.select().from(recordings).where(eq(recordings.concertId, concert.id));
  if (existing.length) {
    return { recordingsFound: existing.length };
  }

  const { findConcertRecording } = await import("../../scripts/search-concert-recordings.mjs");
  const title = `${artist.name} — ${concert.dateLabel}, ${concert.city}`;
  const hit = await findConcertRecording({
    concertId: concert.slug,
    artistName: artist.name,
    title,
    city: concert.city,
    venue: concert.venue,
    sort: concert.sortDate,
    manual: [],
  });

  if (!hit) {
    revalidateConcertPaths(artist.slug);
    return { recordingsFound: 0 };
  }

  await db.insert(recordings).values({
    id: crypto.randomUUID(),
    concertId: concert.id,
    title: hit.title || title,
    url: hit.url,
    duration: hit.duration || "",
  });

  revalidateConcertPaths(artist.slug);
  return { recordingsFound: 1 };
}

export async function uploadConcertVideoFile(
  formData: FormData,
): Promise<{ url: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Keine Datei ausgewählt");
  if (!isAllowedVideoUpload(file.type, file.size)) {
    throw new Error("Ungültiges Video (MP4, WebM oder MOV, max. 500 MB)");
  }
  if (!hasWritableAppDataDir()) {
    throw new Error("Video-Upload ist online nicht verfügbar.");
  }

  const ext = videoUploadExtension(file.type, file.name);
  const filename = `${crypto.randomUUID()}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "videos", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));

  return { url: `/videos/uploads/${filename}` };
}

export async function setConcertVideo(input: {
  artistSlug: string;
  concertSlug: string;
  songTitle: string;
  videoUrl: string;
}): Promise<void> {
  const songTitle = input.songTitle.trim();
  const videoUrl = input.videoUrl.trim();
  if (!songTitle) throw new Error("Song auswählen");
  if (!isValidVideoPath(videoUrl)) throw new Error("Ungültige Video-URL");

  const { db, artist, concert } = await findConcertBySlugs(input.artistSlug, input.concertSlug);
  await db
    .insert(concertVideos)
    .values({ concertId: concert.id, songTitle, url: videoUrl })
    .onConflictDoUpdate({
      target: [concertVideos.concertId, concertVideos.songTitle],
      set: { url: videoUrl },
    });

  revalidateConcertPaths(artist.slug);
}

export async function uploadConcertVideoForSong(formData: FormData): Promise<void> {
  const artistSlug = String(formData.get("artistSlug") || "").trim();
  const concertSlug = String(formData.get("concertSlug") || "").trim();
  const songTitle = String(formData.get("songTitle") || "").trim();
  if (!artistSlug || !concertSlug || !songTitle) {
    throw new Error("Konzert und Song sind erforderlich");
  }

  const uploaded = await uploadConcertVideoFile(formData);
  await setConcertVideo({
    artistSlug,
    concertSlug,
    songTitle,
    videoUrl: uploaded.url,
  });
}

export async function updateConcert(input: {
  artistSlug: string;
  concertSlug: string;
  artistName?: string;
  date?: string;
  venue?: string;
  city?: string;
  tourName?: string;
  note?: string;
}): Promise<UpdateConcertResult> {
  const { db, artist, concert } = await findConcertBySlugs(input.artistSlug, input.concertSlug);

  let artistSlug = artist.slug;
  let concertSlug = concert.slug;

  if (input.artistName?.trim()) {
    const name = input.artistName.trim();
    const nextArtistSlug = slugify(name);
    if (nextArtistSlug !== artist.slug) {
      const clash = (
        await db.select().from(artists).where(eq(artists.slug, nextArtistSlug)).limit(1)
      )[0];
      if (clash && clash.id !== artist.id) {
        throw new Error("Ein anderer Künstler mit diesem Namen existiert bereits");
      }
      await db.update(artists).set({ name, slug: nextArtistSlug }).where(eq(artists.id, artist.id));
      artistSlug = nextArtistSlug;
    } else if (name !== artist.name) {
      await db.update(artists).set({ name }).where(eq(artists.id, artist.id));
    }
  }

  const nextArtist = (
    await db.select().from(artists).where(eq(artists.slug, artistSlug)).limit(1)
  )[0]!;

  const patch: Partial<typeof concerts.$inferInsert> = {};
  if (input.venue !== undefined) patch.venue = input.venue.trim();
  if (input.city !== undefined) patch.city = input.city.trim() || "Berlin";
  if (input.tourName !== undefined) patch.tourName = input.tourName.trim() || nextArtist.name;
  if (input.note !== undefined) patch.note = input.note.trim() || null;

  if (input.date?.trim()) {
    const date = input.date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Datum muss YYYY-MM-DD sein");
    const nextSlug = catalogConcertSlug(nextArtist.name, date);
    if (nextSlug !== concert.slug) {
      const clash = (
        await db
          .select()
          .from(concerts)
          .where(and(eq(concerts.artistId, nextArtist.id), eq(concerts.slug, nextSlug)))
          .limit(1)
      )[0];
      if (clash && clash.id !== concert.id) {
        throw new Error("Für dieses Datum existiert bereits ein Konzert-Eintrag");
      }
      patch.slug = nextSlug;
      concertSlug = nextSlug;
    }
    patch.sortDate = date;
    patch.dateLabel = formatGermanDate(date);
    patch.setlistFmUrl = setlistFmSearchUrl(nextArtist.name, patch.city ?? concert.city, date);
  }

  if (Object.keys(patch).length) {
    await db.update(concerts).set(patch).where(eq(concerts.id, concert.id));
  }

  revalidateConcertPaths(artistSlug);
  return { artistSlug, concertSlug };
}

export async function deleteConcert(artistSlug: string, concertSlugValue: string): Promise<void> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  await db.delete(concerts).where(eq(concerts.id, concert.id));
  revalidateConcertPaths(artist.slug);
}

export async function createConcert(formData: FormData): Promise<CreateConcertResult> {
  const artistName = String(formData.get("artistName") || "").trim();
  const date = String(formData.get("date") || "").trim();
  const venue = String(formData.get("venue") || "").trim();
  const city = String(formData.get("city") || "").trim() || "Berlin";
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

  const cSlug = catalogConcertSlug(artistName, date);
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

  let concertDbId: string;
  if (!existing) {
    concertDbId = crypto.randomUUID();
    await db.insert(concerts).values({
      id: concertDbId,
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
      hidden: false,
      createdAt: new Date().toISOString(),
    });
  } else {
    concertDbId = existing.id;
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
        hidden: false,
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
  } else {
    // Poster enrichment runs as a separate step from AdminForm (with progress UI).
  }

  revalidateConcertPaths(artist.slug);

  const updated = (
    await db.select().from(concerts).where(eq(concerts.id, concertDbId)).limit(1)
  )[0];

  return {
    artistSlug: artist.slug,
    concertSlug: cSlug,
    setlistFmUrl: setlistFm,
    weekdayTime: formatWeekdayTime(date, time),
    posterFound: Boolean(updated?.posterPath),
    hadPosterFromForm: Boolean(posterPath),
  };
}
