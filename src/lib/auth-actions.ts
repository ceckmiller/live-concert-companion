"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "./db/schema";
import { createMagicLink, requestLoginMagicLink, consumeMagicLink } from "./auth/magic-link";
import { loginWithPassword } from "./auth/password-login";
import { destroySession, requireAdmin, requireUser } from "./auth/session";
import { ensureDbInitialized } from "./init-db";

export type LoginPasswordState = { error: string } | null;

export async function loginWithPasswordAction(
  _prev: LoginPasswordState,
  formData: FormData,
): Promise<LoginPasswordState> {
  try {
    await ensureDbInitialized();
    const username = String(formData.get("username") || "");
    const password = String(formData.get("password") || "");
    await loginWithPassword(username, password);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Login fehlgeschlagen",
    };
  }
  // Outside try/catch: redirect() throws a control-flow error in Next.js.
  redirect("/");
}

export async function requestLoginLinkAction(formData: FormData): Promise<{ url: string }> {
  await ensureDbInitialized();
  const email = String(formData.get("email") || "");
  return requestLoginMagicLink(email);
}

export async function consumeMagicLinkAction(token: string): Promise<void> {
  await consumeMagicLink(token);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function inviteUserAction(input: {
  email: string;
  name: string;
}): Promise<{ url: string; email: string; name: string }> {
  const admin = await requireAdmin();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email.split("@")[0];
  const link = await createMagicLink({
    email,
    invitedBy: admin.id,
    ensureMemberUser: { name },
  });
  revalidatePath("/profile");
  revalidatePath("/admin");
  return { url: link.url, email, name };
}

export async function updateUserAction(input: {
  id: string;
  name: string;
  email: string;
}): Promise<{ id: string; name: string; email: string }> {
  await requireAdmin();
  const { updateUserRecord } = await import("./auth/user-admin");
  const updated = await updateUserRecord(input);
  revalidatePath("/profile");
  revalidatePath("/admin");
  return updated;
}

export async function deleteUserAction(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { deleteUserRecord } = await import("./auth/user-admin");
  await deleteUserRecord({ id, actorId: admin.id });
  revalidatePath("/profile");
  revalidatePath("/admin");
}

export async function listUsersAction(): Promise<
  { id: string; email: string; name: string; role: string; createdAt: string }[]
> {
  await requireAdmin();
  const db = getDb();
  const rows = await db.select().from(users).orderBy(users.name);
  return rows
    .filter((u) => u.email !== "admin@localhost" && u.name !== "Admin")
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
    }));
}

export async function listMemberUsersForPicker(): Promise<
  { id: string; email: string; name: string }[]
> {
  await requireUser();
  const db = getDb();
  const rows = await db.select().from(users).orderBy(users.name);
  return rows
    .filter((u) => u.email !== "admin@localhost" && u.name !== "Admin")
    .map((u) => ({ id: u.id, email: u.email, name: u.name }));
}

/** Users + current attendance for the “Wer war dabei?” editor. */
export async function getAttendeeEditorStateAction(concertId: string): Promise<{
  users: { id: string; email: string; name: string }[];
  selectedIds: string[];
  currentUserId: string;
}> {
  const user = await requireUser();
  const { listConcertAttendeeIds } = await import("./queries");
  const [pickerUsers, selectedIds] = await Promise.all([
    listMemberUsersForPicker(),
    listConcertAttendeeIds(concertId),
  ]);
  return {
    // Don’t list yourself — you’re always an attendee when saving.
    users: pickerUsers.filter((u) => u.id !== user.id),
    selectedIds,
    currentUserId: user.id,
  };
}

export async function updateProfileNameAction(name: string): Promise<void> {
  const user = await requireUser();
  const next = name.trim();
  if (!next) throw new Error("Name fehlt");
  const db = getDb();
  await db.update(users).set({ name: next }).where(eq(users.id, user.id));
  revalidatePath("/profile");
}

export async function updateOwnProfileAction(input: {
  name: string;
  email: string;
}): Promise<void> {
  const user = await requireUser();
  const { updateUserRecord } = await import("./auth/user-admin");
  await updateUserRecord({ id: user.id, name: input.name, email: input.email });
  revalidatePath("/profile");
}
