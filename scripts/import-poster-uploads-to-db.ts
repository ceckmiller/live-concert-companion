#!/usr/bin/env tsx
/** Import local public/posters/uploads files into Turso poster_uploads (preserve UUID filenames). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, sql } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { posterUploads } from "../src/lib/db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultUploadsDir = path.join(__dirname, "..", "public", "posters", "uploads");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(url.startsWith("file:") ? { url } : { url, authToken: authToken ?? "" });
const db = drizzle(client);

export async function importLocalPosterUploads(uploadsDir = defaultUploadsDir) {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS poster_uploads (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  if (!fs.existsSync(uploadsDir)) {
    console.warn("no uploads dir:", uploadsDir);
    return { imported: 0, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const filename of fs.readdirSync(uploadsDir)) {
    if (filename.startsWith(".")) continue;
    const ext = path.extname(filename).toLowerCase();
    const mime = MIME[ext];
    if (!mime) continue;

    const id = path.basename(filename, ext);
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;

    const existing = (
      await db.select({ id: posterUploads.id }).from(posterUploads).where(eq(posterUploads.id, id)).limit(1)
    )[0];
    if (existing) {
      skipped++;
      continue;
    }

    const data = fs.readFileSync(path.join(uploadsDir, filename));
    await db.insert(posterUploads).values({
      id,
      mimeType: mime,
      dataBase64: data.toString("base64"),
      createdAt: now,
    });
    imported++;
    console.log("imported", id, ext);
  }

  return { imported, skipped };
}

const isMain = process.argv[1]?.includes("import-poster-uploads-to-db");
if (isMain) {
  importLocalPosterUploads()
    .then((r) => console.log("done", r))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
