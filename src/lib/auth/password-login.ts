import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import { createSession } from "./session";
import { verifyPassword } from "./password";
import type { AuthUser } from "./types";

export async function loginWithPassword(
  usernameRaw: string,
  password: string,
): Promise<AuthUser> {
  const username = usernameRaw.trim().toLowerCase();
  if (!username || !password) {
    throw new Error("Benutzername und Passwort erforderlich");
  }

  const db = getDb();
  const row = (
    await db.select().from(users).where(eq(users.username, username)).limit(1)
  )[0];

  if (!row || !verifyPassword(password, row.passwordHash)) {
    throw new Error("Ungültiger Benutzername oder Passwort");
  }

  await createSession(row.id);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === "admin" ? "admin" : "member",
  };
}
