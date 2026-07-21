#!/usr/bin/env tsx
/**
 * Restore poster paths, crops, and Turso upload blobs from a PITR branch
 * (e.g. live-konzert-companion-poster-recovery2) into production + JSON backup.
 *
 * Usage:
 *   RECOVERY_URL=libsql://... RECOVERY_TOKEN=... npm run db:posters:restore-from-branch
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, sql } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import assetManifest from "../data/asset-manifest.json" with { type: "json" };
import { posterUploads } from "../src/lib/db/schema";
import type { UserPosterOverride } from "../src/lib/user-poster-overrides";
import { syncPosterOverridesFromJson } from "./sync-poster-overrides-to-db.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overridesFile = path.join(__dirname, "..", "data", "user-poster-overrides.json");

/** Recovery slug → current concert slug in seed data. */
export const RECOVERY_SLUG_ALIASES: Record<string, string> = {
  "element-of-crime-2021-08-28": "element-of-crime-2021-08-25",
  "benefizkonzert-fur-den-wahren-heino-1986-10-18": "heino-aid-1986-10-18",
};

function connect(url: string, authToken?: string) {
  return drizzle(
    createClient(url.startsWith("file:") ? { url } : { url, authToken: authToken ?? "" }),
  );
}

function isCustomPoster(
  posterPath: string | null,
  posterCropJson: string | null,
  defaultPaths: Set<string>,
): boolean {
  if (!posterPath && !posterCropJson) return false;
  if (posterCropJson) return true;
  const p = posterPath ?? "";
  if (p.includes("/posters/uploads/") || p.includes("/api/posters/") || p.startsWith("http")) {
    return true;
  }
  if (p && !defaultPaths.has(p) && !p.includes("wikimedia.org")) return true;
  return false;
}

export async function exportOverridesFromBranch(
  recoveryDb: ReturnType<typeof connect>,
): Promise<Record<string, UserPosterOverride>> {
  const manifest = assetManifest as {
    posters: Record<string, string>;
    morrisseyTours: Record<string, string>;
  };
  const defaultPaths = new Set([
    ...Object.values(manifest.posters),
    ...Object.values(manifest.morrisseyTours).map((p) => `/posters/${p.replace(/^\/posters\//, "")}`),
    ...Object.values(manifest.morrisseyTours).map((p) => (p.startsWith("/") ? p : `/posters/${p}`)),
  ]);

  const rows = await recoveryDb.run(sql`
    SELECT slug, poster_path, poster_label, poster_crop_json
    FROM concerts
    WHERE poster_path IS NOT NULL OR poster_crop_json IS NOT NULL
  `);

  const exported: Record<string, UserPosterOverride> = {};
  for (const row of rows.rows as {
    slug: string;
    poster_path: string | null;
    poster_label: string | null;
    poster_crop_json: string | null;
  }[]) {
    if (!isCustomPoster(row.poster_path, row.poster_crop_json, defaultPaths)) continue;
    const key = RECOVERY_SLUG_ALIASES[row.slug] ?? row.slug;
    exported[key] = {
      posterPath: row.poster_path!,
      posterLabel: row.poster_label ?? undefined,
      posterCropJson: row.poster_crop_json ?? null,
    };
  }
  return exported;
}

export async function copyPosterUploads(
  recoveryDb: ReturnType<typeof connect>,
  targetDb: ReturnType<typeof connect>,
): Promise<{ copied: number; skipped: number }> {
  await targetDb.run(sql`
    CREATE TABLE IF NOT EXISTS poster_uploads (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  let copied = 0;
  let skipped = 0;
  let uploadRows: { id: string; mime_type: string; data_base64: string; created_at: string }[] = [];
  try {
    const result = await recoveryDb.run(sql`SELECT id, mime_type, data_base64, created_at FROM poster_uploads`);
    uploadRows = result.rows as typeof uploadRows;
  } catch {
    return { copied: 0, skipped: 0 };
  }

  for (const row of uploadRows) {
    const existing = (
      await targetDb.select({ id: posterUploads.id }).from(posterUploads).where(eq(posterUploads.id, row.id)).limit(1)
    )[0];
    if (existing) {
      await targetDb
        .update(posterUploads)
        .set({
          mimeType: row.mime_type,
          dataBase64: row.data_base64,
          createdAt: row.created_at,
        })
        .where(eq(posterUploads.id, row.id));
      skipped++;
      continue;
    }
    await targetDb.insert(posterUploads).values({
      id: row.id,
      mimeType: row.mime_type,
      dataBase64: row.data_base64,
      createdAt: row.created_at,
    });
    copied++;
  }
  return { copied, skipped };
}

async function main() {
  const recoveryUrl = process.env.RECOVERY_URL;
  const recoveryToken = process.env.RECOVERY_TOKEN;
  if (!recoveryUrl) {
    throw new Error("Set RECOVERY_URL (and RECOVERY_TOKEN) for the PITR branch");
  }

  const prodUrl = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
  const prodToken = process.env.TURSO_AUTH_TOKEN;

  const recoveryDb = connect(recoveryUrl, recoveryToken);
  const prodDb = connect(prodUrl, prodToken);

  const overrides = await exportOverridesFromBranch(recoveryDb);
  fs.mkdirSync(path.dirname(overridesFile), { recursive: true });
  fs.writeFileSync(overridesFile, `${JSON.stringify(overrides, null, 2)}\n`);
  console.log("exported", Object.keys(overrides).length, "overrides to", overridesFile);

  const uploads = await copyPosterUploads(recoveryDb, prodDb);
  console.log("poster_uploads copied", uploads.copied, "skipped", uploads.skipped);

  console.log("syncing overrides to production …");
  await syncPosterOverridesFromJson();
  console.log("done");
}

const isMain = process.argv[1]?.includes("restore-poster-state-from-branch");
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
