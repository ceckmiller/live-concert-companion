import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { magicLinks, users } from "../db/schema";
import { hashToken, magicLinkUrl, randomToken } from "./tokens";
import { createSession } from "./session";
import type { AuthUser } from "./types";

export { ensureAdminUser, ensureNadiaUser } from "./bootstrap-users";

const MAGIC_LINK_HOURS = 72;

export async function createMagicLink(input: {
  email: string;
  invitedBy?: string | null;
  ensureMemberUser?: { name: string };
}): Promise<{ token: string; url: string; expiresAt: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Ungültige E-Mail");

  const db = getDb();
  if (input.ensureMemberUser) {
    const existing = (
      await db.select().from(users).where(eq(users.email, email)).limit(1)
    )[0];
    if (!existing) {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        email,
        name: input.ensureMemberUser.name.trim() || email.split("@")[0],
        role: "member",
        createdAt: new Date().toISOString(),
      });
    } else if (input.ensureMemberUser.name.trim()) {
      await db
        .update(users)
        .set({ name: input.ensureMemberUser.name.trim() })
        .where(eq(users.id, existing.id));
    }
  }

  const raw = randomToken(32);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_HOURS * 60 * 60 * 1000).toISOString();
  await db.insert(magicLinks).values({
    id: crypto.randomUUID(),
    email,
    token: hashToken(raw),
    invitedBy: input.invitedBy ?? null,
    expiresAt,
    consumedAt: null,
    createdAt: new Date().toISOString(),
  });

  return { token: raw, url: magicLinkUrl(raw), expiresAt };
}

export async function consumeMagicLink(rawToken: string): Promise<AuthUser> {
  const token = rawToken.trim();
  if (!token) throw new Error("Token fehlt");

  const db = getDb();
  const now = new Date().toISOString();
  const link = (
    await db
      .select()
      .from(magicLinks)
      .where(and(eq(magicLinks.token, hashToken(token)), isNull(magicLinks.consumedAt)))
      .limit(1)
  )[0];

  if (!link) throw new Error("Link ungültig oder bereits verwendet");
  if (link.expiresAt < now) throw new Error("Link ist abgelaufen");

  let user = (
    await db.select().from(users).where(eq(users.email, link.email)).limit(1)
  )[0];
  if (!user) {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email: link.email,
      name: link.email.split("@")[0],
      role: "member",
      createdAt: now,
    });
    user = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
  }

  await db
    .update(magicLinks)
    .set({ consumedAt: now })
    .where(eq(magicLinks.id, link.id));

  await createSession(user.id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === "admin" ? "admin" : "member",
  };
}

/** Login request for an existing user (no auto-create). */
export async function requestLoginMagicLink(emailRaw: string): Promise<{ url: string }> {
  const email = emailRaw.trim().toLowerCase();
  const db = getDb();
  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) {
    throw new Error("Kein Account für diese E-Mail. Bitte lass dich von einem Admin einladen.");
  }
  const link = await createMagicLink({ email });
  return { url: link.url };
}
