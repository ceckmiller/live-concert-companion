#!/usr/bin/env tsx
/** Apply schema migrations for stable UUIDs / event_title / slug_aliases. */
import { createClient } from "@libsql/client";
import { randomUUID } from "crypto";

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient(url.startsWith("file:") ? { url } : { url, authToken: authToken ?? "" });

async function tryRun(sql: string) {
  try {
    await db.execute(sql);
  } catch {
    // column/table may already exist
  }
}

async function main() {
  await tryRun(`ALTER TABLE concerts ADD COLUMN event_title TEXT`);
  await tryRun(`ALTER TABLE concerts ADD COLUMN event_kind TEXT`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS slug_aliases (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_slug TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await tryRun(`CREATE UNIQUE INDEX IF NOT EXISTS slug_aliases_old_slug_unique ON slug_aliases(old_slug)`);

  await db.execute(`UPDATE concerts SET event_kind = 'multi_act' WHERE event_kind = 'festival'`);

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
    await db.execute({
      sql: `UPDATE concerts SET event_kind = 'multi_act' WHERE slug = ?`,
      args: [slug],
    });
  }

  await db.execute(`
    UPDATE concerts
    SET event_title = (
      SELECT name FROM artists WHERE artists.id = concerts.artist_id
    )
    WHERE event_kind = 'multi_act' AND (event_title IS NULL OR event_title = '')
  `);

  const ferropolis = await db.execute(
    `SELECT id FROM artists WHERE slug = 'ferropolis-open-air' LIMIT 1`,
  );
  const ferropolisId = ferropolis.rows[0]?.id as string | undefined;
  if (ferropolisId) {
    await db.execute({
      sql: `UPDATE concerts SET artist_id = ?, event_kind = 'multi_act', event_title = COALESCE(event_title, 'Ferropolis Open Air') WHERE slug = 'seeed-2014-08-22'`,
      args: [ferropolisId],
    });
  }

  await db.execute(
    `UPDATE concerts SET slug = 'benefizkonzert-fur-den-wahren-heino-1986-10-18', event_kind = 'multi_act', event_title = COALESCE(event_title, 'Benefizkonzert für den wahren Heino') WHERE slug = 'heino-aid-1986-10-18'`,
  );

  // Ensure legacy heino-aid slug resolves via alias if concert was renamed
  const heino = await db.execute(
    `SELECT id FROM concerts WHERE slug = 'benefizkonzert-fur-den-wahren-heino-1986-10-18' LIMIT 1`,
  );
  const heinoId = heino.rows[0]?.id as string | undefined;
  if (heinoId) {
    const existing = await db.execute({
      sql: `SELECT id FROM slug_aliases WHERE old_slug = ? LIMIT 1`,
      args: ["heino-aid-1986-10-18"],
    });
    if (!existing.rows.length) {
      await db.execute({
        sql: `INSERT INTO slug_aliases (id, entity_type, entity_id, old_slug, created_at) VALUES (?, 'concert', ?, ?, ?)`,
        args: [randomUUID(), heinoId, "heino-aid-1986-10-18", new Date().toISOString()],
      });
    }
  }

  const cols = await db.execute(`PRAGMA table_info(concerts)`);
  const eventCols = cols.rows.filter((r) => String(r.name).includes("event"));
  const kinds = await db.execute(
    `SELECT event_kind, count(*) as n FROM concerts GROUP BY event_kind`,
  );
  const titles = await db.execute(
    `SELECT slug, event_title FROM concerts WHERE event_kind = 'multi_act' ORDER BY sort_date`,
  );
  const aliases = await db.execute(`SELECT count(*) as n FROM slug_aliases`);

  console.log("event columns", eventCols);
  console.log("kinds", kinds.rows);
  console.log("multi_act", titles.rows);
  console.log("slug_aliases", aliases.rows[0]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
