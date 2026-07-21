import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureDbInitialized } from "../init-db";
import { getDb } from "../db";
import { concertAttendees, users } from "../db/schema";
import { ensureAdminUser, ensureNadiaUser } from "./bootstrap-users";
import { syncNadiaConcertAttendance } from "./nadia-attendance";
import { verifyPassword } from "./password";

describe("bootstrap users", () => {
  it(
    "ensures Admin password login and Nadia family account",
    async () => {
      await ensureDbInitialized();
      const admin = await ensureAdminUser();
      const nadia = await ensureNadiaUser();
      const db = getDb();

      const adminRow = (
        await db.select().from(users).where(eq(users.id, admin.id)).limit(1)
      )[0];
      expect(adminRow?.username).toBe("admin");
      expect(adminRow?.passwordHash).toBeTruthy();
      expect(verifyPassword("admin123", adminRow?.passwordHash)).toBe(true);

      const nadiaRow = (
        await db.select().from(users).where(eq(users.id, nadia.id)).limit(1)
      )[0];
      expect(nadiaRow?.name).toBe("Nadia");
      expect(nadiaRow?.email).toBe("nadia@familie-eckmiller.de");
      expect(nadiaRow?.role).toBe("member");

      const count = await syncNadiaConcertAttendance(nadia.id);
      expect(count).toBeGreaterThan(0);
      const nadiaConcerts = await db
        .select()
        .from(concertAttendees)
        .where(eq(concertAttendees.userId, nadia.id));
      expect(nadiaConcerts).toHaveLength(count);
    },
    30_000,
  );
});
