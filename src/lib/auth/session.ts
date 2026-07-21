import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";
import { hashToken, randomToken } from "./tokens";
import type { AuthUser, UserRole } from "./types";

export const SESSION_COOKIE = "lkc_session";
const SESSION_DAYS = 60;

function toAuthUser(row: {
  id: string;
  email: string;
  name: string;
  role: string;
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === "admin" ? "admin" : "member",
  };
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const raw = randomToken(32);
  const tokenHash = hashToken(raw);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    token: tokenHash,
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return raw;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    const db = getDb();
    await db.delete(sessions).where(eq(sessions.token, hashToken(raw)));
  }
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const row = (
    await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.token, hashToken(raw)), gt(sessions.expiresAt, now)))
      .limit(1)
  )[0];

  if (!row) return null;
  return toAuthUser(row);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Nur Admins dürfen das");
  }
  return user;
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === "admin";
}

export type { UserRole };
