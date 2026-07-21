import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureDbInitialized } from "../init-db";
import { getDb } from "../db";
import { concertAttendees, concerts, users } from "../db/schema";
import { loadHomeDashboard } from "../queries";
import { ensureAdminUser } from "./magic-link";

describe("attendance scope", () => {
  it(
    "home dashboard only includes concerts the user attends",
    async () => {
      await ensureDbInitialized();
      const db = getDb();
      await ensureAdminUser();
      const memberId = crypto.randomUUID();
      const email = `member-scope-${memberId.slice(0, 8)}@example.com`;
      await db.insert(users).values({
        id: memberId,
        email,
        name: "Scope Member",
        role: "member",
        createdAt: new Date().toISOString(),
      });

      const anyConcert = (
        await db.select({ id: concerts.id }).from(concerts).limit(1)
      )[0];
      expect(anyConcert).toBeTruthy();

      const emptyHome = await loadHomeDashboard(memberId);
      expect(emptyHome.concerts).toHaveLength(0);
      expect(emptyHome.hiddenConcerts).toHaveLength(0);

      await db.insert(concertAttendees).values({
        concertId: anyConcert!.id,
        userId: memberId,
        hidden: false,
        createdAt: new Date().toISOString(),
      });

      const scoped = await loadHomeDashboard(memberId);
      expect(
        scoped.concerts.some((c) => c.id === anyConcert!.id) ||
          scoped.hiddenConcerts.some((c) => c.id === anyConcert!.id),
      ).toBe(true);

      await db.delete(concertAttendees).where(eq(concertAttendees.userId, memberId));
      await db.delete(users).where(eq(users.id, memberId));
    },
    30_000,
  );
});
