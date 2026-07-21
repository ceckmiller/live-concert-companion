import { and, eq } from "drizzle-orm";
import type { getDb } from "./db";
import { artists, concerts, slugAliases } from "./db/schema";

type Db = ReturnType<typeof getDb>;

export async function findArtistById(db: Db, artistId: string) {
  const artist = (
    await db.select().from(artists).where(eq(artists.id, artistId)).limit(1)
  )[0];
  if (!artist) throw new Error("Künstler nicht gefunden");
  return artist;
}

export async function findArtistBySlug(db: Db, artistSlug: string) {
  const artist = (
    await db.select().from(artists).where(eq(artists.slug, artistSlug)).limit(1)
  )[0];
  if (artist) return artist;

  const alias = (
    await db
      .select()
      .from(slugAliases)
      .where(and(eq(slugAliases.entityType, "artist"), eq(slugAliases.oldSlug, artistSlug)))
      .limit(1)
  )[0];
  if (!alias) throw new Error("Künstler nicht gefunden");
  return findArtistById(db, alias.entityId);
}

export async function findConcertById(db: Db, concertId: string) {
  const concert = (
    await db.select().from(concerts).where(eq(concerts.id, concertId)).limit(1)
  )[0];
  if (!concert) throw new Error("Konzert nicht gefunden");
  const artist = await findArtistById(db, concert.artistId);
  return { artist, concert };
}

export async function findConcertBySlug(db: Db, concertSlugValue: string) {
  const concert = (
    await db.select().from(concerts).where(eq(concerts.slug, concertSlugValue)).limit(1)
  )[0];
  if (concert) {
    const artist = await findArtistById(db, concert.artistId);
    return { artist, concert };
  }

  const alias = (
    await db
      .select()
      .from(slugAliases)
      .where(and(eq(slugAliases.entityType, "concert"), eq(slugAliases.oldSlug, concertSlugValue)))
      .limit(1)
  )[0];
  if (!alias) throw new Error("Konzert nicht gefunden");
  return findConcertById(db, alias.entityId);
}

/** Concert slugs are unique; guest festival acts may use a different artist slug in the UI. */
export async function findConcertBySlugs(db: Db, artistSlug: string, concertSlugValue: string) {
  const artistRow = (
    await db.select().from(artists).where(eq(artists.slug, artistSlug)).limit(1)
  )[0];

  if (artistRow) {
    const scoped = (
      await db
        .select()
        .from(concerts)
        .where(and(eq(concerts.artistId, artistRow.id), eq(concerts.slug, concertSlugValue)))
        .limit(1)
    )[0];
    if (scoped) return { artist: artistRow, concert: scoped };
  }

  try {
    return await findConcertBySlug(db, concertSlugValue);
  } catch {
    throw new Error("Konzert nicht gefunden");
  }
}

export async function recordSlugAlias(
  db: Db,
  entityType: "artist" | "concert",
  entityId: string,
  oldSlug: string,
): Promise<void> {
  if (!oldSlug) return;
  const existing = (
    await db.select().from(slugAliases).where(eq(slugAliases.oldSlug, oldSlug)).limit(1)
  )[0];
  if (existing) return;
  await db.insert(slugAliases).values({
    id: crypto.randomUUID(),
    entityType,
    entityId,
    oldSlug,
    createdAt: new Date().toISOString(),
  });
}

export async function resolveArtistIdFromSlugOrId(
  db: Db,
  slugOrId: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  const byId = (
    await db.select().from(artists).where(eq(artists.id, slugOrId)).limit(1)
  )[0];
  if (byId) return byId;
  try {
    return await findArtistBySlug(db, slugOrId);
  } catch {
    return null;
  }
}

export async function resolveConcertIdFromSlugOrId(
  db: Db,
  slugOrId: string,
): Promise<{ artist: typeof artists.$inferSelect; concert: typeof concerts.$inferSelect } | null> {
  const byId = (
    await db.select().from(concerts).where(eq(concerts.id, slugOrId)).limit(1)
  )[0];
  if (byId) {
    const artist = await findArtistById(db, byId.artistId);
    return { artist, concert: byId };
  }
  try {
    return await findConcertBySlug(db, slugOrId);
  } catch {
    return null;
  }
}
