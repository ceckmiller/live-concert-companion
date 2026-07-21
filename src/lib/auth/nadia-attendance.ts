import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import { artists, concertAttendees, concerts } from "../db/schema";

/** Artists where Nadia attended every catalog concert. */
export const NADIA_ALL_CONCERT_ARTIST_SLUGS = [
  "die-fantastischen-vier",
  "peter-fox",
  "seeed",
  "olli-schulz",
  "danger-dan",
  "paul-weller",
  "robbie-williams",
  "the-cure",
  "jan-delay",
  "sting",
  "cro",
  "bilderbuch",
  "element-of-crime",
  "christian-steiffen",
  "depeche-mode",
  "peace-by-peace",
  "loyle-carner",
  "jochen-distelmeyer",
  "wanda",
  "u2",
  "ferropolis-open-air",
  "simply-red",
  "herbert-groenemeyer",
  "david-bowie",
  "madonna",
  "tom-jones",
] as const;

/** Morrissey: only these three shows — not the full catalog. */
export const NADIA_MORRISSEY_CONCERT_SLUGS = [
  "berlin-2026", // Zitadelle Spandau 2026
  "rah-2018", // Royal Albert Hall 2018
  "ally-pally-2018", // Alexandra Palace 2018
] as const;

/** Replace Nadia’s attendance with the curated shared-concert set. */
export async function syncNadiaConcertAttendance(nadiaUserId: string): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();

  await db.delete(concertAttendees).where(eq(concertAttendees.userId, nadiaUserId));

  const artistRows = await db
    .select({ id: artists.id, slug: artists.slug })
    .from(artists)
    .where(inArray(artists.slug, [...NADIA_ALL_CONCERT_ARTIST_SLUGS]));
  const artistIds = artistRows.map((a) => a.id);

  const morrissey = (
    await db.select({ id: artists.id }).from(artists).where(eq(artists.slug, "morrissey")).limit(1)
  )[0];

  const conditions = [];
  if (artistIds.length) {
    conditions.push(inArray(concerts.artistId, artistIds));
  }
  if (morrissey) {
    conditions.push(
      and(
        eq(concerts.artistId, morrissey.id),
        inArray(concerts.slug, [...NADIA_MORRISSEY_CONCERT_SLUGS]),
      ),
    );
  }

  if (!conditions.length) return 0;

  const matching = await db
    .select({ id: concerts.id })
    .from(concerts)
    .where(or(...conditions));

  for (const row of matching) {
    await db.insert(concertAttendees).values({
      concertId: row.id,
      userId: nadiaUserId,
      hidden: false,
      createdAt: now,
    });
  }

  return matching.length;
}

/** Remove leftover test/legacy accounts (never show “Admin” as a person). */
export async function deleteAttendeeTestUsers(): Promise<string[]> {
  const db = getDb();
  const { users } = await import("../db/schema");
  const { getServerEnv } = await import("../runtime-env");
  const realAdminEmail = (
    getServerEnv("ADMIN_EMAIL") || "carsten@autovio.de"
  )
    .trim()
    .toLowerCase();

  const emailsToRemove = [
    "carsten-attendee-test@example.com",
    "nadja-attendee-test@example.com",
    "nadia-create-test@localhost",
    "nadia@localhost",
    // Pseudo admin account — real admin is Carsten via ADMIN_EMAIL.
    "admin@localhost",
  ];
  const removed: string[] = [];
  for (const email of emailsToRemove) {
    if (email === realAdminEmail) continue;
    const row = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (row) {
      await db.delete(users).where(eq(users.id, row.id));
      removed.push(email);
    }
  }
  return removed;
}
