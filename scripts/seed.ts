#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, sql } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { artists, concerts } from "../src/lib/db/schema";
import { OTHER_CONCERTS } from "./live-konzert-companion-concerts.mjs";
import { TOUR_POSTERS } from "./tour-posters.mjs";
import { getOfficialVideo } from "./official-videos-other.mjs";
import { CONCERT_REVIEWS } from "./concert-reviews.mjs";
import { CONCERT_RECORDINGS } from "./concert-recordings-other.mjs";
import concertRecordingsFound from "../data/concert-recordings-found.json" with { type: "json" };
import { getSongMeta } from "./other-song-meta.mjs";
import enrichmentData from "../data/other-concerts-enrichment.json" with { type: "json" };
import concertLiveVideos from "../data/concert-live-videos.json" with { type: "json" };
import morrisseyLiveVideos from "../data/morrissey-live-videos.json" with { type: "json" };
import assetManifest from "../data/asset-manifest.json" with { type: "json" };
import searchCache from "../data/tour-poster-search-cache.json" with { type: "json" };
import { applyUserPosterOverride } from "../src/lib/user-poster-overrides.ts";
import { exportPosterOverridesFromDb } from "./export-poster-overrides-from-db.ts";
import { syncPosterOverridesFromJson } from "./sync-poster-overrides-to-db.ts";
// @ts-expect-error ESM metadata module
import { SONG_META } from "./morrissey-song-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(
  url.startsWith("file:") ? { url } : { url, authToken: authToken ?? "" },
);
const db = drizzle(client);
const manifest = assetManifest as {
  artists: Record<string, string>;
  posters: Record<string, string>;
  morrisseyTours: Record<string, string>;
};

function artistImage(slug: string): string | null {
  return manifest.artists[slug] ?? null;
}

function tourPoster(artistSlug: string, tourName: string): string | null {
  if (tourName === "Peace x Peace Festival" && artistSlug !== "peace-by-peace") {
    return manifest.posters["peace-by-peace:Peace x Peace Festival"] ?? manifest.posters[`${artistSlug}:${tourName}`] ?? null;
  }
  if (tourName === "Madstock Festival" && artistSlug !== "madstock") {
    return manifest.posters["madstock:Madstock Festival"] ?? manifest.posters[`${artistSlug}:${tourName}`] ?? null;
  }
  return manifest.posters[`${artistSlug}:${tourName}`] ?? null;
}

function tourPosterMeta(artistSlug: string, tourName: string) {
  const sharedFestivalTour =
    tourName === "Peace x Peace Festival"
      ? "peace-by-peace"
      : tourName === "Madstock Festival"
        ? "madstock"
        : null;
  const curated =
    (sharedFestivalTour && artistSlug !== sharedFestivalTour
      ? TOUR_POSTERS[sharedFestivalTour as keyof typeof TOUR_POSTERS]?.[tourName]
      : undefined) ??
    TOUR_POSTERS[artistSlug as keyof typeof TOUR_POSTERS]?.[tourName];
  const key = `${artistSlug}:${tourName}`;
  const lookupKey = sharedFestivalTour && artistSlug !== sharedFestivalTour ? `${sharedFestivalTour}:${tourName}` : key;
  const searched = (searchCache as Record<string, { label?: string; kind?: string }>)[lookupKey]
    ?? (searchCache as Record<string, { label?: string; kind?: string }>)[key];
  if (curated?.kind === "poster") return curated;
  if (searched) {
    return {
      label: searched.label || `Tourplakat: ${tourName}`,
      kind: searched.kind || "poster",
    };
  }
  return curated;
}

function extractMorrissey() {
  const html = fs.readFileSync(path.join(root, "data", "morrissey-konzerte.html"), "utf8");
  const dataMatch = html.match(/const DATA = (\{[\s\S]*?\});/);
  const videosMatch = html.match(/const OFFICIAL_VIDEOS = (\{[\s\S]*?\});/);
  if (!dataMatch) throw new Error("DATA missing");
  const DATA = JSON.parse(dataMatch[1]) as {
    tours: Record<string, { poster?: string; label?: string; kind?: string }>;
    concerts: Array<{
      id: string;
      sort: string;
      date: string;
      city: string;
      venue: string;
      tour: string;
      note?: string;
      poster?: string;
      posterLabel?: string;
      setlistFm?: string;
      setlist: string[];
      videos?: Record<string, string>;
      reviews?: { title: string; url: string; source: string }[];
      recordings?: { title: string; url: string; duration: string }[];
    }>;
  };
  const OFFICIAL_VIDEOS = videosMatch ? JSON.parse(videosMatch[1]) : {};
  return { DATA, OFFICIAL_VIDEOS, SONG_META };
}

async function main() {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      image_path TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS artists_slug_unique ON artists(slug)`);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS tours (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      poster_path TEXT,
      label TEXT,
      kind TEXT NOT NULL DEFAULT 'album'
    )
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS tours_artist_name_unique ON tours(artist_id, name)`,
  );
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS concerts (
      id TEXT PRIMARY KEY,
      artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      sort_date TEXT NOT NULL,
      date_label TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      tour_name TEXT NOT NULL DEFAULT '',
      note TEXT,
      poster_path TEXT,
      poster_label TEXT,
      setlist_fm_url TEXT,
      ticket_image_path TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS concerts_artist_slug_unique ON concerts(artist_id, slug)`,
  );
  try {
    await db.run(sql`ALTER TABLE concerts ADD COLUMN poster_crop_json TEXT`);
  } catch {
    // Column already exists.
  }
  try {
    await db.run(sql`ALTER TABLE concerts ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists.
  }
  try {
    await db.run(sql`ALTER TABLE concerts ADD COLUMN event_kind TEXT NOT NULL DEFAULT 'solo'`);
  } catch {
    // Column already exists.
  }
  try {
    await db.run(sql`ALTER TABLE concerts ADD COLUMN event_title TEXT`);
  } catch {
    // Column already exists.
  }
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS slug_aliases (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_slug TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS slug_aliases_old_slug_unique ON slug_aliases(old_slug)`);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS poster_uploads (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS setlist_items (
      concert_id TEXT NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      song_title TEXT NOT NULL,
      PRIMARY KEY (concert_id, position)
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS song_meta (
      artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      song_title TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'artist',
      album TEXT,
      year INTEGER,
      cover_by TEXT,
      official_video_url TEXT,
      PRIMARY KEY (artist_id, song_title)
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS concert_videos (
      concert_id TEXT NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
      song_title TEXT NOT NULL,
      url TEXT NOT NULL,
      PRIMARY KEY (concert_id, song_title)
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      concert_id TEXT NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT ''
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY,
      concert_id TEXT NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      duration TEXT NOT NULL DEFAULT ''
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS concert_acts (
      id TEXT PRIMARY KEY,
      concert_id TEXT NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      artist_slug TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      setlist_fm_url TEXT,
      note TEXT,
      setlist_complete INTEGER NOT NULL DEFAULT 1,
      setlist_json TEXT NOT NULL,
      videos_json TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Backup poster overrides from DB before wiping concerts (poster_uploads stay).
  try {
    const exported = await exportPosterOverridesFromDb();
    console.log("Pre-seed poster export:", exported.count, "→", exported.outFile);
  } catch (e) {
    console.warn("Pre-seed poster export skipped:", e);
  }

  // Preserve poster_uploads + slug_aliases across re-seeds (binary blobs / rename history).
  await db.run(sql`DELETE FROM recordings`);
  await db.run(sql`DELETE FROM reviews`);
  await db.run(sql`DELETE FROM concert_videos`);
  await db.run(sql`DELETE FROM concert_acts`);
  await db.run(sql`DELETE FROM setlist_items`);
  await db.run(sql`DELETE FROM song_meta`);
  await db.run(sql`DELETE FROM concerts`);
  await db.run(sql`DELETE FROM tours`);
  await db.run(sql`DELETE FROM artists`);

  const { DATA, OFFICIAL_VIDEOS } = extractMorrissey();
  const artistId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.run(
    sql`INSERT INTO artists (id, slug, name, image_path, created_at) VALUES (${artistId}, 'morrissey', 'Morrissey', ${artistImage("morrissey")}, ${now})`,
  );

  const tourIds = new Map<string, string>();
  for (const [name, t] of Object.entries(DATA.tours)) {
    const tourId = crypto.randomUUID();
    const poster =
      manifest.morrisseyTours[name] ||
      (t.poster ? t.poster.replace(/^morrissey-posters\//, "/posters/") : null);
    await db.run(
      sql`INSERT INTO tours (id, artist_id, name, poster_path, label, kind) VALUES (${tourId}, ${artistId}, ${name}, ${poster}, ${t.label ?? null}, ${t.kind ?? "album"})`,
    );
    tourIds.set(name, tourId);
  }

  for (const [song, meta] of Object.entries(SONG_META as Record<string, { origin: string; album?: string; year?: number; by?: string }>)) {
    await db.run(
      sql`INSERT INTO song_meta (artist_id, song_title, origin, album, year, cover_by, official_video_url) VALUES (${artistId}, ${song}, ${meta.origin}, ${meta.album ?? null}, ${meta.year ?? null}, ${meta.by ?? null}, ${(OFFICIAL_VIDEOS as Record<string, string>)[song] ?? null})`,
    );
  }

  for (const c of DATA.concerts) {
    const defaultPoster =
      manifest.morrisseyTours[c.tour] ||
      (c.poster || DATA.tours[c.tour]?.poster || "").replace(/^morrissey-posters\//, "/posters/");
    const posterFields = applyUserPosterOverride(c.id, {
      posterPath: defaultPoster || null,
      posterLabel: c.posterLabel || DATA.tours[c.tour]?.label || null,
    });
    const concertId = crypto.randomUUID();
    await db.run(
      sql`INSERT INTO concerts (id, artist_id, slug, sort_date, date_label, city, venue, tour_name, note, poster_path, poster_label, poster_crop_json, setlist_fm_url, created_at)
          VALUES (${concertId}, ${artistId}, ${c.id}, ${c.sort}, ${c.date}, ${c.city}, ${c.venue}, ${c.tour}, ${c.note ?? null}, ${posterFields.posterPath}, ${posterFields.posterLabel}, ${posterFields.posterCropJson}, ${c.setlistFm ?? null}, ${now})`,
    );
    for (let i = 0; i < c.setlist.length; i++) {
      await db.run(
        sql`INSERT INTO setlist_items (concert_id, position, song_title) VALUES (${concertId}, ${i + 1}, ${c.setlist[i]})`,
      );
    }
    if (c.videos) {
      for (const [song, videoUrl] of Object.entries(c.videos)) {
        await db.run(
          sql`INSERT INTO concert_videos (concert_id, song_title, url) VALUES (${concertId}, ${song}, ${videoUrl})`,
        );
      }
    }
    const morrisseyLive = (morrisseyLiveVideos as Record<string, Record<string, string>>)[c.id] ?? {};
    for (const [song, videoUrl] of Object.entries(morrisseyLive)) {
      if (c.videos?.[song]) continue;
      await db.run(
        sql`INSERT INTO concert_videos (concert_id, song_title, url) VALUES (${concertId}, ${song}, ${videoUrl})`,
      );
    }
    for (const r of c.reviews || []) {
      await db.run(
        sql`INSERT INTO reviews (id, concert_id, title, url, source) VALUES (${crypto.randomUUID()}, ${concertId}, ${r.title}, ${r.url}, ${r.source})`,
      );
    }
    for (const r of c.recordings || []) {
      await db.run(
        sql`INSERT INTO recordings (id, concert_id, title, url, duration) VALUES (${crypto.randomUUID()}, ${concertId}, ${r.title}, ${r.url}, ${r.duration})`,
      );
    }
  }

  const enrichmentById = enrichmentData as Record<
    string,
    {
      venue?: string;
      city?: string;
      tour?: string;
      setlistFmUrl?: string;
      note?: string;
      setlist?: string[];
      setlistComplete?: boolean;
      videos?: Record<string, string>;
      reviews?: { title: string; url: string; source: string }[];
      acts?: {
        artistId: string;
        artistName: string;
        setlist?: string[];
        setlistFmUrl?: string;
        note?: string;
        setlistComplete?: boolean;
        videos?: Record<string, string>;
      }[];
    }
  >;
  const reviewsById = CONCERT_REVIEWS as Record<
    string,
    { title: string; url: string; source: string }[]
  >;
  const artistTourKeys = new Set<string>();

  async function ensureArtist(slug: string, name: string): Promise<string> {
    let artistRow = (
      await db.select({ id: artists.id }).from(artists).where(eq(artists.slug, slug)).limit(1)
    )[0];
    let aid = artistRow?.id;
    const imagePath = artistImage(slug);
    if (!aid) {
      aid = crypto.randomUUID();
      await db.run(
        sql`INSERT INTO artists (id, slug, name, image_path, created_at) VALUES (${aid}, ${slug}, ${name}, ${imagePath}, ${now})`,
      );
    } else if (imagePath) {
      await db.run(sql`UPDATE artists SET image_path = ${imagePath} WHERE id = ${aid}`);
    }
    return aid;
  }

  async function seedSongMetaAndVideos(
    artistSlug: string,
    artistId: string,
    concertId: string,
    setlist: string[],
    setlistComplete: boolean,
    liveVideos: Record<string, string>,
    insertedVideoSongs: Set<string>,
  ) {
    for (let i = 0; i < setlist.length; i++) {
      const song = setlist[i];
      await db.run(
        sql`INSERT INTO setlist_items (concert_id, position, song_title) VALUES (${concertId}, ${i + 1}, ${song})`,
      );
      const meta = getSongMeta(artistSlug, song);
      const officialUrl = getOfficialVideo(artistSlug, song);
      await db.run(
        sql`INSERT INTO song_meta (artist_id, song_title, origin, album, year, cover_by, official_video_url) VALUES (${artistId}, ${song}, ${meta.origin}, ${meta.album}, ${meta.year}, ${meta.by}, ${officialUrl ?? null}) ON CONFLICT(artist_id, song_title) DO UPDATE SET origin = excluded.origin, album = excluded.album, year = excluded.year, cover_by = excluded.cover_by, official_video_url = COALESCE(excluded.official_video_url, song_meta.official_video_url)`,
      );
      const liveUrl = liveVideos[song];
      if (liveUrl && !insertedVideoSongs.has(`${concertId}:${song}`)) {
        insertedVideoSongs.add(`${concertId}:${song}`);
        await db.run(
          sql`INSERT INTO concert_videos (concert_id, song_title, url) VALUES (${concertId}, ${song}, ${liveUrl})`,
        );
      }
    }
  }

  for (const c of OTHER_CONCERTS) {
    const enrichment = enrichmentById[c.id] || {};
    const aid = await ensureArtist(c.artistId, c.artistName);

    const city = enrichment.city || c.city || "Berlin";
    const venue = enrichment.venue || c.venue || "";
    const tourName = enrichment.tour || c.title;
    const tourInfo = tourPosterMeta(c.artistId, tourName);
    const defaultPosterPath = tourPoster(c.artistId, tourName) || tourInfo?.poster || null;
    const defaultPosterLabel = tourInfo?.label || tourName;
    const posterFields = applyUserPosterOverride(c.id, {
      posterPath: defaultPosterPath,
      posterLabel: defaultPosterLabel,
    });
    const posterPath = posterFields.posterPath;
    const posterLabel = posterFields.posterLabel;
    const posterCropJson = posterFields.posterCropJson;
    const posterKind = tourInfo?.kind || "album";
    const tourKey = `${aid}:${tourName}`;
    if (posterPath && !artistTourKeys.has(tourKey)) {
      artistTourKeys.add(tourKey);
      await db.run(
        sql`INSERT INTO tours (id, artist_id, name, poster_path, label, kind) VALUES (${crypto.randomUUID()}, ${aid}, ${tourName}, ${posterPath}, ${posterLabel}, ${posterKind})`,
      );
    }

    const [y, m, d] = c.sort.split("-");
    const months = [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];
    const dateLabel = `${Number(d)}. ${months[Number(m) - 1]} ${y}`;
    const setlistFmRaw = enrichment.setlistFmUrl?.trim();
    const setlistFm =
      setlistFmRaw ||
      `https://www.setlist.fm/search?query=${encodeURIComponent(`${c.artistName} ${city} ${c.sort}`)}`;
    const noteParts = [c.subtitle, enrichment.note].filter(Boolean);
    const note = noteParts.length ? noteParts.join(" — ") : null;
    const setlist = enrichment.setlist || [];
    const concertId = crypto.randomUUID();
    const insertedVideoSongs = new Set<string>();

    const eventKind =
      c.id === "bilderbuch-2017-06-18"
        ? "festival_slot"
        : [
              "madstock-1992-08-08",
              "peace-by-peace-2016-06-05",
              "peace-by-peace-2017-06-18",
              "konzert-fuer-berlin-1989-11-12",
              "benefizkonzert-fur-den-wahren-heino-1986-10-18",
              "seeed-2014-08-22",
            ].includes(c.id)
          ? "multi_act"
          : "solo";
    const eventTitle =
      eventKind === "multi_act" ? (c.eventTitle ?? c.artistName ?? null) : null;

    await db.run(
      sql`INSERT INTO concerts (id, artist_id, slug, sort_date, date_label, city, venue, tour_name, note, poster_path, poster_label, poster_crop_json, setlist_fm_url, ticket_image_path, event_kind, event_title, created_at)
          VALUES (${concertId}, ${aid}, ${c.id}, ${c.sort}, ${dateLabel}, ${city}, ${venue}, ${tourName}, ${note}, ${posterPath}, ${posterLabel}, ${posterCropJson}, ${setlistFm}, ${null}, ${eventKind}, ${eventTitle}, ${now})`,
    );

    for (const r of [...(reviewsById[c.id] || []), ...(enrichment.reviews || [])]) {
      await db.run(
        sql`INSERT INTO reviews (id, concert_id, title, url, source) VALUES (${crypto.randomUUID()}, ${concertId}, ${r.title}, ${r.url}, ${r.source})`,
      );
    }

    for (const rec of [
      ...(CONCERT_RECORDINGS[c.id as keyof typeof CONCERT_RECORDINGS] || []),
      ...((concertRecordingsFound as Record<string, { title: string; url: string; duration: string }[]>)[c.id] || []),
    ]) {
      await db.run(
        sql`INSERT INTO recordings (id, concert_id, title, url, duration) VALUES (${crypto.randomUUID()}, ${concertId}, ${rec.title}, ${rec.url}, ${rec.duration})`,
      );
    }

    if (enrichment.acts?.length) {
      const festivalLive = (concertLiveVideos as Record<string, Record<string, string>>)[c.id] ?? {};
      for (let actIndex = 0; actIndex < enrichment.acts.length; actIndex++) {
        const act = enrichment.acts[actIndex];
        const actSetlist = act.setlist ?? [];
        const actComplete = act.setlistComplete !== false;
        const actArtistId = await ensureArtist(act.artistId, act.artistName);
        const actVideos = {
          ...(act.videos ?? {}),
          ...Object.fromEntries(
            actSetlist.filter((song) => festivalLive[song]).map((song) => [song, festivalLive[song]]),
          ),
        };
        const actId = crypto.randomUUID();
        const actSetlistFm = act.setlistFmUrl?.trim() || null;

        await db.run(
          sql`INSERT INTO concert_acts (id, concert_id, position, artist_slug, artist_name, setlist_fm_url, note, setlist_complete, setlist_json, videos_json)
              VALUES (${actId}, ${concertId}, ${actIndex + 1}, ${act.artistId}, ${act.artistName}, ${actSetlistFm}, ${act.note ?? null}, ${actComplete ? 1 : 0}, ${JSON.stringify(actSetlist)}, ${JSON.stringify(actVideos)})`,
        );

        for (const song of actSetlist) {
          const meta = getSongMeta(act.artistId, song);
          const officialUrl = getOfficialVideo(act.artistId, song);
          await db.run(
            sql`INSERT INTO song_meta (artist_id, song_title, origin, album, year, cover_by, official_video_url) VALUES (${actArtistId}, ${song}, ${meta.origin}, ${meta.album}, ${meta.year}, ${meta.by}, ${officialUrl ?? null}) ON CONFLICT(artist_id, song_title) DO UPDATE SET origin = excluded.origin, album = excluded.album, year = excluded.year, cover_by = excluded.cover_by, official_video_url = COALESCE(excluded.official_video_url, song_meta.official_video_url)`,
          );
        }
      }
    } else {
      const setlistComplete = enrichment.setlistComplete !== false;
      const liveVideos = {
        ...((concertLiveVideos as Record<string, Record<string, string>>)[c.id] ?? {}),
        ...(enrichment.videos ?? {}),
      };
      await seedSongMetaAndVideos(
        c.artistId,
        aid,
        concertId,
        setlist,
        setlistComplete,
        liveVideos,
        insertedVideoSongs,
      );
    }
  }

  const artistCount = (await db.select({ n: sql<number>`count(*)` }).from(artists))[0]?.n ?? 0;
  const concertCount = (await db.select({ n: sql<number>`count(*)` }).from(concerts))[0]?.n ?? 0;
  console.log("Seeded companion DB:", { artists: artistCount, concerts: concertCount });
  console.log("Syncing poster overrides from data/user-poster-overrides.json …");
  await syncPosterOverridesFromJson();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
