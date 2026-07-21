import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "./db";

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureDbInitialized() {
  if (initialized) return;
  if (!initPromise) {
    initPromise = runDbInit().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

async function runDbInit() {
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
    CREATE TABLE IF NOT EXISTS catalog_exclusions (
      catalog_slug TEXT PRIMARY KEY,
      excluded_at TEXT NOT NULL,
      reason TEXT
    )
  `);
  // User-deleted catalog events that must never return via seed
  await db.run(sql`
    INSERT OR IGNORE INTO catalog_exclusions (catalog_slug, excluded_at, reason)
    VALUES ('peace-by-peace-2016-06-05', ${new Date().toISOString()}, 'user-deleted')
  `);

  await migrateKnownEventKinds(db);

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

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS poster_uploads (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL
    )
  `);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email)`);
  try {
    await db.run(sql`ALTER TABLE users ADD COLUMN username TEXT`);
  } catch {
    // Column already exists.
  }
  try {
    await db.run(sql`ALTER TABLE users ADD COLUMN password_hash TEXT`);
  } catch {
    // Column already exists.
  }
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username)`);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_unique ON sessions(token)`);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS magic_links_token_unique ON magic_links(token)`);

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS concert_attendees (
      concert_id TEXT NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (concert_id, user_id)
    )
  `);

  await bootstrapAdminAndAttendees(db);

  initialized = true;
}


async function bootstrapAdminAndAttendees(db: ReturnType<typeof getDb>) {
  const { ensureAdminUser, ensureNadiaUser } = await import("./auth/bootstrap-users");
  const { deleteAttendeeTestUsers } = await import("./auth/nadia-attendance");
  const admin = await ensureAdminUser();
  await ensureNadiaUser();
  await deleteAttendeeTestUsers();
  const now = new Date().toISOString();
  // Backfill: every existing concert belongs to the admin chronology.
  await db.run(sql`
    INSERT OR IGNORE INTO concert_attendees (concert_id, user_id, hidden, created_at)
    SELECT id, ${admin.id}, COALESCE(hidden, 0), ${now} FROM concerts
  `);
}

async function migrateKnownEventKinds(db: ReturnType<typeof getDb>) {
  // Rename legacy festival → multi_act
  await db.run(sql`UPDATE concerts SET event_kind = 'multi_act' WHERE event_kind = 'festival'`);

  const multiActSlugs = [
    "madstock-1992-08-08",
    "peace-by-peace-2016-06-05",
    "peace-by-peace-2017-06-18",
    "konzert-fuer-berlin-1989-11-12",
    "benefizkonzert-fur-den-wahren-heino-1986-10-18",
    "heino-aid-1986-10-18",
    "seeed-2014-08-22",
    "ferropolis-open-air-2014-08-22",
  ];
  for (const slug of multiActSlugs) {
    await db.run(sql`UPDATE concerts SET event_kind = 'multi_act' WHERE slug = ${slug}`);
  }
  await db.run(
    sql`UPDATE concerts SET event_kind = 'festival_slot' WHERE slug = 'bilderbuch-2017-06-18'`,
  );

  // Backfill event_title from owning artist name for multi_act rows missing it
  await db.run(sql`
    UPDATE concerts
    SET event_title = (
      SELECT artists.name FROM artists WHERE artists.id = concerts.artist_id
    )
    WHERE event_kind = 'multi_act' AND (event_title IS NULL OR event_title = '')
  `);

  const now = new Date().toISOString();
  const ferropolisArtist = (
    await db.run(sql`SELECT id FROM artists WHERE slug = 'ferropolis-open-air' LIMIT 1`)
  ).rows[0] as unknown as { id: string } | undefined;
  let ferropolisId = ferropolisArtist?.id;
  if (!ferropolisId) {
    ferropolisId = randomUUID();
    await db.run(
      sql`INSERT INTO artists (id, slug, name, created_at) VALUES (${ferropolisId}, 'ferropolis-open-air', 'Ferropolis Open Air', ${now})`,
    );
  }
  await db.run(
    sql`UPDATE concerts SET artist_id = ${ferropolisId}, event_kind = 'multi_act', event_title = COALESCE(event_title, 'Ferropolis Open Air') WHERE slug = 'seeed-2014-08-22'`,
  );

  await db.run(
    sql`UPDATE artists SET slug = 'benefizkonzert-fur-den-wahren-heino', name = 'Benefizkonzert für den wahren Heino' WHERE slug = 'heino-aid'`,
  );
  await db.run(
    sql`UPDATE concerts SET slug = 'benefizkonzert-fur-den-wahren-heino-1986-10-18', event_kind = 'multi_act', event_title = COALESCE(event_title, 'Benefizkonzert für den wahren Heino') WHERE slug = 'heino-aid-1986-10-18'`,
  );
}
