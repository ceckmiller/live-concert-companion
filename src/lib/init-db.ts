import { sql } from "drizzle-orm";
import { getDb } from "./db";

let initialized = false;

export async function ensureDbInitialized() {
  if (initialized) return;
  const db = getDb();

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
  try {
    await db.run(sql`ALTER TABLE artists ADD COLUMN image_path TEXT`);
  } catch {
    // Column already exists.
  }

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

  initialized = true;
}
