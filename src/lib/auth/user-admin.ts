import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertValidEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@") || normalized.startsWith("@")) {
    throw new Error("Ungültige E-Mail");
  }
  return normalized;
}

export async function updateUserRecord(input: {
  id: string;
  name: string;
  email: string;
  /** Admin may not demote/delete themselves via this path; role stays unchanged. */
}): Promise<{ id: string; name: string; email: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Name fehlt");
  const email = assertValidEmail(input.email);
  const db = getDb();

  const existing = (
    await db.select().from(users).where(eq(users.id, input.id)).limit(1)
  )[0];
  if (!existing) throw new Error("Person nicht gefunden");

  const clash = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, input.id)))
      .limit(1)
  )[0];
  if (clash) throw new Error("Diese E-Mail ist bereits vergeben");

  await db.update(users).set({ name, email }).where(eq(users.id, input.id));
  return { id: input.id, name, email };
}

export async function deleteUserRecord(input: {
  id: string;
  actorId: string;
}): Promise<void> {
  if (input.id === input.actorId) {
    throw new Error("Eigenen Account kannst du nicht löschen");
  }
  const db = getDb();
  const existing = (
    await db.select().from(users).where(eq(users.id, input.id)).limit(1)
  )[0];
  if (!existing) throw new Error("Person nicht gefunden");
  if (existing.role === "admin") {
    throw new Error("Admin-Account kann nicht gelöscht werden");
  }
  await db.delete(users).where(eq(users.id, input.id));
}
