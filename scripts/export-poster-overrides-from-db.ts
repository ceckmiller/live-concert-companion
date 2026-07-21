#!/usr/bin/env tsx
/** Backup concert poster paths, labels, and crops from DB into data/user-poster-overrides.json. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { isNotNull, or } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { concerts } from "../src/lib/db/schema";
import type { UserPosterOverride } from "../src/lib/user-poster-overrides";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(__dirname, "..", "data", "user-poster-overrides.json");

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(url.startsWith("file:") ? { url } : { url, authToken: authToken ?? "" });
const db = drizzle(client);

export async function exportPosterOverridesFromDb() {
  const rows = await db
    .select({
      id: concerts.id,
      slug: concerts.slug,
      posterPath: concerts.posterPath,
      posterLabel: concerts.posterLabel,
      posterCropJson: concerts.posterCropJson,
    })
    .from(concerts)
    .where(
      or(
        isNotNull(concerts.posterPath),
        isNotNull(concerts.posterCropJson),
      ),
    );

  const exported: Record<string, UserPosterOverride> = {};
  for (const row of rows) {
    if (!row.posterPath) continue;
    const isCustom =
      row.posterPath.includes("/posters/uploads/") ||
      row.posterPath.includes("/api/posters/") ||
      row.posterPath.startsWith("http");
    if (!isCustom && !row.posterCropJson) continue;

    const override: UserPosterOverride = {
      posterPath: row.posterPath,
      posterLabel: row.posterLabel ?? undefined,
      posterCropJson: row.posterCropJson ?? null,
    };
    // Prefer UUID keys; keep slug for seed applyUserPosterOverride(catalogSlug).
    exported[row.id] = override;
    exported[row.slug] = override;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(exported, null, 2)}\n`);
  return { count: Object.keys(exported).length, outFile };
}

const isMain = process.argv[1]?.includes("export-poster-overrides-from-db");
if (isMain) {
  exportPosterOverridesFromDb()
    .then((r) => console.log("exported", r.count, "overrides to", r.outFile))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
