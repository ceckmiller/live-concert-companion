import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import { getServerEnv } from "../runtime-env";
import { hashPassword, verifyPassword } from "./password";

export async function ensureAdminUser(): Promise<{ id: string; email: string; name: string }> {
  const email = (getServerEnv("ADMIN_EMAIL") || "carsten@autovio.de").trim().toLowerCase();
  const name = (getServerEnv("ADMIN_NAME") || "Carsten").trim() || "Carsten";
  const username = (getServerEnv("ADMIN_USERNAME") || "admin").trim().toLowerCase() || "admin";
  const password = getServerEnv("ADMIN_PASSWORD") || "admin123";
  const db = getDb();

  const existing = (
    await db.select().from(users).where(eq(users.email, email)).limit(1)
  )[0];

  if (existing) {
    const patch: {
      role?: string;
      name?: string;
      username?: string;
      passwordHash?: string;
    } = {};
    if (existing.role !== "admin") patch.role = "admin";
    if (existing.name !== name) patch.name = name;
    if (existing.username !== username) patch.username = username;
    if (!existing.passwordHash || !verifyPassword(password, existing.passwordHash)) {
      patch.passwordHash = hashPassword(password);
    }
    if (Object.keys(patch).length) {
      await db.update(users).set(patch).where(eq(users.id, existing.id));
    }
    return { id: existing.id, email: existing.email, name: patch.name ?? existing.name };
  }

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email,
    name,
    username,
    passwordHash: hashPassword(password),
    role: "admin",
    createdAt: new Date().toISOString(),
  });
  return { id, email, name };
}

/** Shared concert companion — always available in “Wer war dabei?”. */
export async function ensureNadiaUser(): Promise<{ id: string; email: string; name: string }> {
  const email = (
    getServerEnv("NADIA_EMAIL") || "nadia@familie-eckmiller.de"
  )
    .trim()
    .toLowerCase();
  const name = (getServerEnv("NADIA_NAME") || "Nadia").trim() || "Nadia";
  const db = getDb();
  const existing = (
    await db.select().from(users).where(eq(users.email, email)).limit(1)
  )[0];
  if (existing) {
    if (existing.name !== name) {
      await db.update(users).set({ name }).where(eq(users.id, existing.id));
    }
    return { id: existing.id, email: existing.email, name: existing.name !== name ? name : existing.name };
  }
  // Prefer renaming the legacy bootstrap account instead of creating a duplicate.
  const legacy = (
    await db.select().from(users).where(eq(users.email, "nadia@localhost")).limit(1)
  )[0];
  if (legacy) {
    await db.update(users).set({ email, name }).where(eq(users.id, legacy.id));
    return { id: legacy.id, email, name };
  }
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email,
    name,
    username: null,
    passwordHash: null,
    role: "member",
    createdAt: new Date().toISOString(),
  });
  return { id, email, name };
}
