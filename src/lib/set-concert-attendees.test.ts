import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

const actorId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const companionId = "ffffffff-1111-4222-8333-444444444444";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("./auth/session", () => ({
  requireUser: vi.fn(async () => ({
    id: actorId,
    email: "carsten@example.com",
    name: "Carsten",
    role: "admin",
  })),
  requireAdmin: vi.fn(async () => ({
    id: actorId,
    email: "carsten@example.com",
    name: "Carsten",
    role: "admin",
  })),
}));

import { setConcertAttendees } from "./actions";
import { ensureDbInitialized } from "./init-db";
import { getDb } from "./db";
import { concertAttendees, concerts, users } from "./db/schema";

describe("setConcertAttendees", () => {
  beforeEach(async () => {
    await ensureDbInitialized();
    const db = getDb();
    for (const row of [
      {
        id: actorId,
        email: "carsten-attendee-test@example.com",
        name: "Carsten",
        role: "admin" as const,
      },
      {
        id: companionId,
        email: "nadja-attendee-test@example.com",
        name: "Nadja",
        role: "member" as const,
      },
    ]) {
      const exists = (await db.select().from(users).where(eq(users.id, row.id)).limit(1))[0];
      if (!exists) {
        await db.insert(users).values({
          ...row,
          createdAt: new Date().toISOString(),
        });
      }
    }
  });

  it(
    "adds a companion so the concert appears in their chronology scope",
    async () => {
      const db = getDb();
      const concert = (await db.select({ id: concerts.id }).from(concerts).limit(1))[0];
      expect(concert).toBeTruthy();

      await db
        .delete(concertAttendees)
        .where(
          and(
            eq(concertAttendees.concertId, concert!.id),
            eq(concertAttendees.userId, companionId),
          ),
        );

      await setConcertAttendees(concert!.id, [actorId, companionId]);

      const row = (
        await db
          .select()
          .from(concertAttendees)
          .where(
            and(
              eq(concertAttendees.concertId, concert!.id),
              eq(concertAttendees.userId, companionId),
            ),
          )
          .limit(1)
      )[0];
      expect(row).toBeTruthy();

      await db
        .delete(concertAttendees)
        .where(
          and(
            eq(concertAttendees.concertId, concert!.id),
            eq(concertAttendees.userId, companionId),
          ),
        );
    },
    30_000,
  );
});
