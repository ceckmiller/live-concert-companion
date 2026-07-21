#!/usr/bin/env tsx
/** Push poster paths, labels, and crops from data/user-poster-overrides.json into Turso/local DB. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { and, eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { concerts, tours } from "../src/lib/db/schema";
import type { UserPosterOverride } from "../src/lib/user-poster-overrides";

/** Legacy slug keys in overrides JSON → current concert slug in DB. */
export const SLUG_ALIASES: Record<string, string> = {
  "heino-aid-1986-10-18": "benefizkonzert-fur-den-wahren-heino-1986-10-18",
  "element-of-crime-2021-08-28": "element-of-crime-2021-08-25",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overridesFile = path.join(__dirname, "..", "data", "user-poster-overrides.json");

function loadOverrides(): Record<string, UserPosterOverride> {
  if (!fs.existsSync(overridesFile)) return {};
  return JSON.parse(fs.readFileSync(overridesFile, "utf8")) as Record<string, UserPosterOverride>;
}

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(url.startsWith("file:") ? { url } : { url, authToken: authToken ?? "" });
const db = drizzle(client);

async function resolveConcert(overrideKey: string): Promise<{ id: string; slug: string } | null> {
  if (UUID_RE.test(overrideKey)) {
    const byId = (
      await db
        .select({ id: concerts.id, slug: concerts.slug })
        .from(concerts)
        .where(eq(concerts.id, overrideKey))
        .limit(1)
    )[0];
    if (byId) return byId;
  }

  const candidates = [overrideKey, SLUG_ALIASES[overrideKey]].filter(Boolean) as string[];
  for (const slug of candidates) {
    const row = (
      await db
        .select({ id: concerts.id, slug: concerts.slug })
        .from(concerts)
        .where(eq(concerts.slug, slug))
        .limit(1)
    )[0];
    if (row) return row;
  }
  return null;
}

async function applyOverride(
  concert: { id: string; slug: string },
  override: UserPosterOverride,
) {
  const row = (
    await db
      .select({
        id: concerts.id,
        tourName: concerts.tourName,
        artistId: concerts.artistId,
      })
      .from(concerts)
      .where(eq(concerts.id, concert.id))
      .limit(1)
  )[0];
  if (!row) {
    console.warn("skip (concert missing):", concert.slug);
    return;
  }

  await db
    .update(concerts)
    .set({
      posterPath: override.posterPath,
      posterLabel: override.posterLabel ?? null,
      posterCropJson: override.posterCropJson ?? null,
    })
    .where(eq(concerts.id, row.id));

  const tourName = row.tourName?.trim();
  if (tourName) {
    const tourMatch = (
      await db
        .select({ id: tours.id, label: tours.label })
        .from(tours)
        .where(and(eq(tours.artistId, row.artistId), eq(tours.name, tourName)))
        .limit(1)
    )[0];

    if (tourMatch) {
      await db
        .update(tours)
        .set({
          posterPath: override.posterPath,
          label: override.posterLabel ?? tourMatch.label,
          kind: "poster",
        })
        .where(eq(tours.id, tourMatch.id));
    }
  }

  console.log("updated", concert.slug, override.posterPath, override.posterCropJson ? "crop" : "");
}

async function syncPosterOverridesFromJson() {
  const overrides = loadOverrides();
  for (const [overrideKey, override] of Object.entries(overrides)) {
    const concert = await resolveConcert(overrideKey);
    if (!concert) {
      console.warn("skip (no concert):", overrideKey);
      continue;
    }
    await applyOverride(concert, override);
  }
}

async function main() {
  await syncPosterOverridesFromJson();
}

export { syncPosterOverridesFromJson };

const isMain = process.argv[1]?.includes("sync-poster-overrides-to-db");
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
