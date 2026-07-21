"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import { ensureDbInitialized } from "./init-db";
import {
  artists,
  catalogExclusions,
  concertAttendees,
  concerts,
  concertVideos,
  recordings,
  reviews,
  setlistItems,
  tours,
  users,
} from "./db/schema";
import { requireAdmin, requireUser } from "./auth/session";
import {
  formatGermanDate,
  formatWeekdayTime,
  catalogConcertSlug,
  setlistFmSearchUrl,
  slugify,
} from "./slug";
import { parsePosterCropJson, serializePosterCropJson, type PosterCrop } from "./poster-crop";
import {
  findConcertById,
  findConcertBySlugs as resolveConcertBySlugs,
  recordSlugAlias,
} from "./concert-lookup";
import {
  assertConcertSlugAvailable,
  computeUpdatedConcertSlug,
} from "./festival-concert-update";
import { isMultiActConcert } from "./festivals";
import {
  isValidPosterPath,
  posterTitleFromFilename,
  posterUploadExtension,
  readPosterUploadFromFormData,
  resolvePosterLabel,
} from "./poster-upload";
import { hasWritableAppDataDir } from "./runtime-env";
import { fetchSetlistFromSetlistFm } from "./setlist-fm-fetch";
import { savePosterUploadToDb } from "./poster-storage";
import { saveUserPosterOverride } from "./user-poster-overrides";
import {
  isAllowedVideoUpload,
  isValidVideoPath,
  videoUploadExtension,
} from "./video-upload";

export type CreateConcertResult = {
  artistId: string;
  artistSlug: string;
  concertId: string;
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
  artistId: string;
  artistSlug: string;
  concertId: string;
  concertSlug: string;
};

export type PosterCandidate = {
  url: string;
  title: string;
  width: number;
  height: number;
  score: number;
};

function revalidateConcertPaths(ids: {
  artistIds?: string[];
  concertIds?: string[];
  artistSlugs?: string[];
}) {
  revalidatePath("/");
  revalidatePath("/admin");
  for (const id of new Set(ids.artistIds ?? [])) {
    revalidatePath(`/artist/${id}`);
  }
  for (const id of new Set(ids.concertIds ?? [])) {
    revalidatePath(`/concert/${id}`);
  }
  for (const slug of new Set(ids.artistSlugs ?? [])) {
    revalidatePath(`/artist/${slug}`);
  }
}

async function resolveConcertRef(input: {
  concertId?: string;
  artistSlug?: string;
  concertSlug?: string;
}) {
  const db = getDb();
  if (input.concertId) {
    const { artist, concert } = await findConcertById(db, input.concertId);
    return { db, artist, concert };
  }
  if (input.artistSlug && input.concertSlug) {
    const { artist, concert } = await resolveConcertBySlugs(
      db,
      input.artistSlug,
      input.concertSlug,
    );
    return { db, artist, concert };
  }
  throw new Error("Konzert-Referenz fehlt (concertId oder artistSlug+concertSlug)");
}

/** @deprecated prefer resolveConcertRef with concertId */
async function findConcertBySlugs(artistSlug: string, concertSlugValue: string) {
  return resolveConcertRef({ artistSlug, concertSlug: concertSlugValue });
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
  try {
    await ensureDbInitialized();
    const { name, type, buffer } = await readPosterUploadFromFormData(formData);
    if (!hasWritableAppDataDir()) {
      return savePosterUploadToDb(buffer, type, name);
    }

    const ext = posterUploadExtension(type, name);
    const filename = `${crypto.randomUUID()}${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "posters", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    return {
      url: `/posters/uploads/${filename}`,
      title: posterTitleFromFilename(name),
    };
  } catch (err) {
    console.error("uploadConcertPosterFile failed", err);
    if (err instanceof Error) {
      if (err.message.includes("EROFS") || err.message.includes("read-only file system")) {
        throw new Error("Plakat-Upload ist auf dem Server nicht verfügbar. Bitte Seite neu laden.");
      }
      if (!err.message.includes("Server Components render")) {
        throw err;
      }
    }
    throw new Error(
      "Plakat-Upload fehlgeschlagen. Bitte Seite neu laden und erneut versuchen.",
    );
  }
}

export async function setConcertPoster(input: {
  concertId?: string;
  artistSlug?: string;
  concertSlug?: string;
  posterUrl: string;
  posterTitle?: string;
  tourName?: string;
  posterCrop?: PosterCrop | null;
}): Promise<void> {
  await requireUser();
  const posterUrl = input.posterUrl.trim();
  if (!isValidPosterPath(posterUrl)) throw new Error("Ungültige Poster-URL");

  const { db, artist, concert } = await resolveConcertRef(input);
  const tourName = (input.tourName || concert.tourName || artist.name).trim();
  const posterLabel = resolvePosterLabel({
    posterTitle: input.posterTitle,
    tourName,
    posterUrl,
    existingPosterPath: concert.posterPath,
    existingPosterLabel: concert.posterLabel,
  });
  const posterCropJson =
    input.posterCrop === undefined && posterUrl === concert.posterPath
      ? concert.posterCropJson
      : serializePosterCropJson(input.posterCrop);

  await db
    .update(concerts)
    .set({ posterPath: posterUrl, posterLabel, tourName, posterCropJson })
    .where(eq(concerts.id, concert.id));

  saveUserPosterOverride(concert.id, {
    posterPath: posterUrl,
    posterLabel,
    posterCropJson,
  });
  // Keep slug key for seed compatibility until JSON is fully migrated.
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

  revalidateConcertPaths({
    artistIds: [artist.id],
    concertIds: [concert.id],
    artistSlugs: [artist.slug],
  });
}

export async function setConcertHidden(
  concertIdOrArtistSlug: string,
  concertSlugOrHidden?: string | boolean,
  hiddenMaybe?: boolean,
): Promise<void> {
  const user = await requireUser();
  // New: setConcertHidden(concertId, hidden)
  // Legacy: setConcertHidden(artistSlug, concertSlug, hidden)
  let db;
  let artist;
  let concert;
  let hidden: boolean;
  if (typeof concertSlugOrHidden === "boolean") {
    ({ db, artist, concert } = await resolveConcertRef({ concertId: concertIdOrArtistSlug }));
    hidden = concertSlugOrHidden;
  } else {
    ({ db, artist, concert } = await resolveConcertRef({
      artistSlug: concertIdOrArtistSlug,
      concertSlug: String(concertSlugOrHidden),
    }));
    hidden = Boolean(hiddenMaybe);
  }

  const existing = (
    await db
      .select()
      .from(concertAttendees)
      .where(
        and(
          eq(concertAttendees.concertId, concert.id),
          eq(concertAttendees.userId, user.id),
        ),
      )
      .limit(1)
  )[0];
  if (!existing) throw new Error("Du bist bei diesem Konzert nicht eingetragen");

  await db
    .update(concertAttendees)
    .set({ hidden })
    .where(
      and(eq(concertAttendees.concertId, concert.id), eq(concertAttendees.userId, user.id)),
    );
  revalidateConcertPaths({
    artistIds: [artist.id],
    concertIds: [concert.id],
    artistSlugs: [artist.slug],
  });
}

export async function setConcertAttendees(
  concertId: string,
  userIds: string[],
): Promise<void> {
  const actor = await requireUser();
  const { db, artist, concert } = await resolveConcertRef({ concertId });

  const current = await db
    .select()
    .from(concertAttendees)
    .where(eq(concertAttendees.concertId, concert.id));
  const currentIds = new Set(current.map((c) => c.userId));
  if (actor.role !== "admin" && !currentIds.has(actor.id)) {
    throw new Error("Nur Teilnehmer:innen dieses Konzerts können Begleitungen setzen");
  }

  // Actor always stays; companions checked in the UI are added/removed.
  const unique = [...new Set([...userIds.filter(Boolean), actor.id])];
  const valid = await db.select({ id: users.id }).from(users).where(inArray(users.id, unique));
  const validIds = new Set(valid.map((v) => v.id));
  validIds.add(actor.id);

  for (const row of current) {
    if (!validIds.has(row.userId)) {
      await db
        .delete(concertAttendees)
        .where(
          and(
            eq(concertAttendees.concertId, concert.id),
            eq(concertAttendees.userId, row.userId),
          ),
        );
    }
  }

  const now = new Date().toISOString();
  for (const uid of validIds) {
    if (currentIds.has(uid)) continue;
    await db.insert(concertAttendees).values({
      concertId: concert.id,
      userId: uid,
      hidden: false,
      createdAt: now,
    });
  }

  revalidateConcertPaths({
    artistIds: [artist.id],
    concertIds: [concert.id],
    artistSlugs: [artist.slug],
  });
  revalidatePath("/");
  revalidatePath("/artists");
  revalidatePath(`/concert/${concert.id}`);
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

function concertSearchName(artist: { name: string }, concert: { eventTitle?: string | null }) {
  return concert.eventTitle?.trim() || artist.name;
}

export async function enrichConcertSetlist(
  artistSlug: string,
  concertSlugValue: string,
): Promise<EnrichSetlistResult> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  const fetched = await fetchSetlistFromSetlistFm({
    artistName: concertSearchName(artist, concert),
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

  revalidateConcertPaths({ artistIds: [artist.id], concertIds: [concert.id], artistSlugs: [artist.slug] });
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
    revalidateConcertPaths({ artistIds: [artist.id], concertIds: [concert.id], artistSlugs: [artist.slug] });
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

  revalidateConcertPaths({ artistIds: [artist.id], concertIds: [concert.id], artistSlugs: [artist.slug] });
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
    artistName: concertSearchName(artist, concert),
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

  revalidateConcertPaths({ artistIds: [artist.id], concertIds: [concert.id], artistSlugs: [artist.slug] });
  return { found: true, url };
}

export async function enrichConcertRecordings(
  artistSlug: string,
  concertSlugValue: string,
  options: { force?: boolean } = {},
): Promise<{ recordingsFound: number; added: number }> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  const existing = await db.select().from(recordings).where(eq(recordings.concertId, concert.id));
  if (existing.length && !options.force) {
    return { recordingsFound: existing.length, added: 0 };
  }

  const { findConcertRecording } = await import("../../scripts/search-concert-recordings.mjs");
  const searchName = concertSearchName(artist, concert);
  const title = `${searchName} — ${concert.dateLabel}, ${concert.city}`;
  const hit = await findConcertRecording({
    concertId: concert.slug,
    artistName: searchName,
    title,
    city: concert.city,
    venue: concert.venue,
    sort: concert.sortDate,
    manual: [],
  });

  if (!hit) {
    revalidateConcertPaths({ artistIds: [artist.id], concertIds: [concert.id], artistSlugs: [artist.slug] });
    return { recordingsFound: existing.length, added: 0 };
  }

  if (existing.some((r) => r.url === hit.url)) {
    return { recordingsFound: existing.length, added: 0 };
  }

  await db.insert(recordings).values({
    id: crypto.randomUUID(),
    concertId: concert.id,
    title: hit.title || title,
    url: hit.url,
    duration: hit.duration || "",
  });

  revalidateConcertPaths({ artistIds: [artist.id], concertIds: [concert.id], artistSlugs: [artist.slug] });
  return { recordingsFound: existing.length + 1, added: 1 };
}

export async function enrichConcertReviews(
  artistSlug: string,
  concertSlugValue: string,
): Promise<{ reviewsFound: number; added: number }> {
  const { db, artist, concert } = await findConcertBySlugs(artistSlug, concertSlugValue);
  const existing = await db.select().from(reviews).where(eq(reviews.concertId, concert.id));
  const haveUrls = new Set(existing.map((r) => r.url));

  const { findConcertReviews } = await import("../../scripts/search-concert-reviews.mjs");
  const found = await findConcertReviews({
    artistName: concertSearchName(artist, concert),
    city: concert.city,
    venue: concert.venue,
    sort: concert.sortDate,
  });

  let added = 0;
  for (const hit of found) {
    if (haveUrls.has(hit.url)) continue;
    await db.insert(reviews).values({
      id: crypto.randomUUID(),
      concertId: concert.id,
      title: hit.title,
      url: hit.url,
      source: hit.source || "",
    });
    haveUrls.add(hit.url);
    added++;
  }

  revalidateConcertPaths({ artistIds: [artist.id], concertIds: [concert.id], artistSlugs: [artist.slug] });
  return { reviewsFound: existing.length + added, added };
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
  concertId?: string;
  artistSlug?: string;
  concertSlug?: string;
  songTitle: string;
  videoUrl: string;
}): Promise<void> {
  const songTitle = input.songTitle.trim();
  const videoUrl = input.videoUrl.trim();
  if (!songTitle) throw new Error("Song auswählen");
  if (!isValidVideoPath(videoUrl)) throw new Error("Ungültige Video-URL");

  const { db, artist, concert } = await resolveConcertRef(input);
  await db
    .insert(concertVideos)
    .values({ concertId: concert.id, songTitle, url: videoUrl })
    .onConflictDoUpdate({
      target: [concertVideos.concertId, concertVideos.songTitle],
      set: { url: videoUrl },
    });

  revalidateConcertPaths({ artistIds: [artist.id], concertIds: [concert.id], artistSlugs: [artist.slug] });
}

export async function uploadConcertVideoForSong(formData: FormData): Promise<void> {
  const concertId = String(formData.get("concertId") || "").trim();
  const artistSlug = String(formData.get("artistSlug") || "").trim();
  const concertSlug = String(formData.get("concertSlug") || "").trim();
  const songTitle = String(formData.get("songTitle") || "").trim();
  if ((!concertId && (!artistSlug || !concertSlug)) || !songTitle) {
    throw new Error("Konzert und Song sind erforderlich");
  }

  const uploaded = await uploadConcertVideoFile(formData);
  await setConcertVideo({
    concertId: concertId || undefined,
    artistSlug: artistSlug || undefined,
    concertSlug: concertSlug || undefined,
    songTitle,
    videoUrl: uploaded.url,
  });
}

export async function updateConcert(input: {
  concertId?: string;
  artistSlug?: string;
  concertSlug?: string;
  artistName?: string;
  date?: string;
  venue?: string;
  city?: string;
  tourName?: string;
  note?: string;
  /** When set, switches event between solo and multi_act. */
  multiAct?: boolean;
}): Promise<UpdateConcertResult> {
  await requireUser();
  const { db, artist, concert } = await resolveConcertRef(input);
  const previousArtistId = artist.id;
  const previousArtistSlug = artist.slug;
  const previousConcertSlug = concert.slug;
  const wasMultiAct = isMultiActConcert({
    id: concert.id,
    slug: concert.slug,
    eventKind: concert.eventKind,
  });
  const isMultiAct = input.multiAct !== undefined ? Boolean(input.multiAct) : wasMultiAct;

  let artistSlug = artist.slug;
  let artistId = artist.id;
  let concertSlug = concert.slug;
  const eventNameInput = input.artistName?.trim();
  const nameChanged = Boolean(
    eventNameInput &&
      eventNameInput !== (isMultiAct ? concert.eventTitle || artist.name : artist.name),
  );
  let dateChanged = false;
  let sortDate = concert.sortDate;

  const patch: Partial<typeof concerts.$inferInsert> = {};

  if (isMultiAct !== wasMultiAct) {
    patch.eventKind = isMultiAct ? "multi_act" : "solo";
    if (isMultiAct) {
      patch.eventTitle = eventNameInput || concert.eventTitle || artist.name;
    } else {
      patch.eventTitle = null;
    }
  }

  if (eventNameInput) {
    if (isMultiAct) {
      // Multi-act: rename only event_title — artist UUID/slug stay stable for URLs.
      patch.eventTitle = eventNameInput;
      patch.eventKind = "multi_act";
    } else {
      const nextArtistSlug = slugify(eventNameInput);
      if (nextArtistSlug !== artist.slug) {
        const clash = (
          await db.select().from(artists).where(eq(artists.slug, nextArtistSlug)).limit(1)
        )[0];
        if (clash && clash.id !== artist.id) {
          throw new Error("Ein anderer Künstler mit diesem Namen existiert bereits");
        }
        await recordSlugAlias(db, "artist", artist.id, artist.slug);
        await db
          .update(artists)
          .set({ name: eventNameInput, slug: nextArtistSlug })
          .where(eq(artists.id, artist.id));
        artistSlug = nextArtistSlug;
      } else if (eventNameInput !== artist.name) {
        await db.update(artists).set({ name: eventNameInput }).where(eq(artists.id, artist.id));
      }
    }
  }

  const nextArtist = (
    await db.select().from(artists).where(eq(artists.id, artistId)).limit(1)
  )[0]!;
  artistSlug = nextArtist.slug;

  if (input.venue !== undefined) patch.venue = input.venue.trim();
  if (input.city !== undefined) patch.city = input.city.trim() || "Berlin";
  if (input.tourName !== undefined) patch.tourName = input.tourName.trim() || nextArtist.name;
  if (input.note !== undefined) patch.note = input.note.trim() || null;

  if (input.date?.trim()) {
    const date = input.date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Datum muss YYYY-MM-DD sein");
    dateChanged = date !== concert.sortDate;
    sortDate = date;
    patch.sortDate = date;
    patch.dateLabel = formatGermanDate(date);
    const searchName = isMultiAct
      ? eventNameInput || concert.eventTitle || nextArtist.name
      : nextArtist.name;
    patch.setlistFmUrl = setlistFmSearchUrl(searchName, patch.city ?? concert.city, date);
  }

  const displayName =
    (isMultiAct
      ? eventNameInput || concert.eventTitle || nextArtist.name
      : eventNameInput || nextArtist.name) ?? nextArtist.name;
  const nextSlug = computeUpdatedConcertSlug(displayName, sortDate, {
    isFestivalEvent: isMultiAct,
    nameChanged,
    dateChanged,
  });
  if (nextSlug && nextSlug !== concert.slug) {
    await assertConcertSlugAvailable(db, nextArtist.id, nextSlug, concert.id);
    await recordSlugAlias(db, "concert", concert.id, previousConcertSlug);
    patch.slug = nextSlug;
    concertSlug = nextSlug;
  }

  if (Object.keys(patch).length) {
    await db.update(concerts).set(patch).where(eq(concerts.id, concert.id));
  }

  revalidateConcertPaths({
    artistIds: [previousArtistId, artistId],
    concertIds: [concert.id],
    artistSlugs: [previousArtistSlug, artistSlug],
  });
  return {
    artistId,
    artistSlug,
    concertId: concert.id,
    concertSlug,
  };
}

export async function deleteConcert(
  concertIdOrArtistSlug: string,
  concertSlugValue?: string,
): Promise<void> {
  await requireAdmin();
  await ensureDbInitialized();
  const { db, artist, concert } = concertSlugValue
    ? await resolveConcertRef({
        artistSlug: concertIdOrArtistSlug,
        concertSlug: concertSlugValue,
      })
    : await resolveConcertRef({ concertId: concertIdOrArtistSlug });

  // Persist exclusion so seed/catalog cannot resurrect this concert.
  await db
    .insert(catalogExclusions)
    .values({
      catalogSlug: concert.slug,
      excludedAt: new Date().toISOString(),
      reason: "user-deleted",
    })
    .onConflictDoNothing();

  await db.delete(concerts).where(eq(concerts.id, concert.id));
  revalidateConcertPaths({
    artistIds: [artist.id],
    concertIds: [concert.id],
    artistSlugs: [artist.slug],
  });
}

export async function createConcert(formData: FormData): Promise<CreateConcertResult> {
  const user = await requireUser();
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
  const multiAct =
    formData.get("multiAct") === "on" ||
    formData.get("multiAct") === "true" ||
    formData.get("multiAct") === "1";

  if (!artistName || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      multiAct
        ? "Event-Name und Datum (YYYY-MM-DD) sind erforderlich"
        : "Künstler und Datum (YYYY-MM-DD) sind erforderlich",
    );
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

  const eventKind = multiAct ? "multi_act" : "solo";
  const eventTitle = multiAct ? artistName : null;

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
      eventKind,
      eventTitle,
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
        eventKind,
        eventTitle,
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
    saveUserPosterOverride(concertDbId, {
      posterPath,
      posterLabel: posterLabel || undefined,
      posterCropJson,
    });
  }

  const attendeeExists = (
    await db
      .select()
      .from(concertAttendees)
      .where(
        and(
          eq(concertAttendees.concertId, concertDbId),
          eq(concertAttendees.userId, user.id),
        ),
      )
      .limit(1)
  )[0];
  if (!attendeeExists) {
    await db.insert(concertAttendees).values({
      concertId: concertDbId,
      userId: user.id,
      hidden: false,
      createdAt: new Date().toISOString(),
    });
  }

  revalidateConcertPaths({
    artistIds: [artist.id],
    concertIds: [concertDbId],
    artistSlugs: [artist.slug],
  });

  const updated = (
    await db.select().from(concerts).where(eq(concerts.id, concertDbId)).limit(1)
  )[0];

  return {
    artistId: artist.id,
    artistSlug: artist.slug,
    concertId: concertDbId,
    concertSlug: cSlug,
    setlistFmUrl: setlistFm,
    weekdayTime: formatWeekdayTime(date, time),
    posterFound: Boolean(updated?.posterPath),
    hadPosterFromForm: Boolean(posterPath),
  };
}
