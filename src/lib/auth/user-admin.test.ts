import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureDbInitialized } from "../init-db";
import { getDb } from "../db";
import { users } from "../db/schema";
import { ensureAdminUser } from "./bootstrap-users";
import {
  assertValidEmail,
  deleteUserRecord,
  updateUserRecord,
} from "./user-admin";

describe("user admin", () => {
  it("validates email", () => {
    expect(assertValidEmail("  Nadia@Example.com ")).toBe("nadia@example.com");
    expect(() => assertValidEmail("nope")).toThrow("Ungültige E-Mail");
  });

  it(
    "updates email/name and deletes a member",
    async () => {
      await ensureDbInitialized();
      const admin = await ensureAdminUser();
      const db = getDb();
      const id = crypto.randomUUID();
      const email = `edit-me-${id.slice(0, 8)}@example.com`;
      await db.insert(users).values({
        id,
        email,
        name: "Temp Person",
        role: "member",
        createdAt: new Date().toISOString(),
      });

      const updated = await updateUserRecord({
        id,
        name: "Temp Edited",
        email: `edited-${id.slice(0, 8)}@example.com`,
      });
      expect(updated.name).toBe("Temp Edited");
      expect(updated.email).toBe(`edited-${id.slice(0, 8)}@example.com`);

      await expect(deleteUserRecord({ id: admin.id, actorId: admin.id })).rejects.toThrow(
        "Eigenen Account",
      );

      await deleteUserRecord({ id, actorId: admin.id });
      const gone = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
      expect(gone).toBeUndefined();
    },
    30_000,
  );
});
