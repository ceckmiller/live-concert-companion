import { and, eq } from "drizzle-orm";
import type { getDb } from "./db";
import { artists, concerts } from "./db/schema";
import { isMultiActConcert } from "./festivals";
import { catalogConcertSlug, slugify } from "./slug";

type Db = ReturnType<typeof getDb>;

export function computeUpdatedConcertSlug(
  eventName: string,
  sortDate: string,
  options: { isFestivalEvent: boolean; nameChanged: boolean; dateChanged: boolean },
): string | null {
  if (options.isFestivalEvent) {
    if (!options.nameChanged && !options.dateChanged) return null;
    return catalogConcertSlug(eventName, sortDate);
  }
  if (!options.dateChanged) return null;
  return catalogConcertSlug(eventName, sortDate);
}

/** Festival events get their own pseudo-artist when the owner also has solo concerts (e.g. Seeed + Ferropolis). */
export async function resolveFestivalEventOwner(
  db: Db,
  input: {
    currentArtistId: string;
    concertId: string;
    eventName: string;
  },
): Promise<{ id: string; slug: string; name: string; movedToNewArtist: boolean }> {
  const eventName = input.eventName.trim();
  const nextArtistSlug = slugify(eventName);
  if (!nextArtistSlug) throw new Error("Event-Name ist ungültig");

  const siblingRows = await db
    .select({ id: concerts.id, slug: concerts.slug, eventKind: concerts.eventKind })
    .from(concerts)
    .where(eq(concerts.artistId, input.currentArtistId));

  const otherHeadliners = siblingRows.filter((row) => row.id !== input.concertId);
  const hasSoloSibling = otherHeadliners.some(
    (row) => !isMultiActConcert({ id: row.id, slug: row.slug, eventKind: row.eventKind }),
  );

  if (hasSoloSibling) {
    const existing = (
      await db.select().from(artists).where(eq(artists.slug, nextArtistSlug)).limit(1)
    )[0];
    if (existing) {
      return {
        id: existing.id,
        slug: existing.slug,
        name: existing.name,
        movedToNewArtist: existing.id !== input.currentArtistId,
      };
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.insert(artists).values({
      id,
      slug: nextArtistSlug,
      name: eventName,
      createdAt: now,
    });
    return { id, slug: nextArtistSlug, name: eventName, movedToNewArtist: true };
  }

  const clash = (
    await db.select().from(artists).where(eq(artists.slug, nextArtistSlug)).limit(1)
  )[0];
  if (clash && clash.id !== input.currentArtistId) {
    throw new Error("Ein anderer Künstler mit diesem Namen existiert bereits");
  }

  await db
    .update(artists)
    .set({ name: eventName, slug: nextArtistSlug })
    .where(eq(artists.id, input.currentArtistId));

  return {
    id: input.currentArtistId,
    slug: nextArtistSlug,
    name: eventName,
    movedToNewArtist: false,
  };
}

export async function assertConcertSlugAvailable(
  db: Db,
  artistId: string,
  nextSlug: string,
  concertId: string,
): Promise<void> {
  const clash = (
    await db
      .select({ id: concerts.id })
      .from(concerts)
      .where(and(eq(concerts.artistId, artistId), eq(concerts.slug, nextSlug)))
      .limit(1)
  )[0];
  if (clash && clash.id !== concertId) {
    throw new Error("Für dieses Datum existiert bereits ein Konzert-Eintrag");
  }
}
