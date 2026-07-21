import { eq } from "drizzle-orm";
import { ensureDbInitialized } from "../src/lib/init-db";
import { createMagicLink, ensureAdminUser } from "../src/lib/auth/magic-link";
import { getDb } from "../src/lib/db";
import { concertAttendees, concerts, users } from "../src/lib/db/schema";
import { loadHomeDashboard } from "../src/lib/queries";

async function main() {
  await ensureDbInitialized();
  const admin = await ensureAdminUser();
  console.log("admin", admin.email);

  const memberEmail = `smoke-member-${Date.now()}@example.com`;
  const invite = await createMagicLink({
    email: memberEmail,
    invitedBy: admin.id,
    ensureMemberUser: { name: "Smoke Member" },
  });
  if (!invite.url.includes("/auth/magic?token=")) {
    throw new Error("bad invite url: " + invite.url);
  }
  console.log("invite url ok");

  const db = getDb();
  const member = (
    await db.select().from(users).where(eq(users.email, memberEmail)).limit(1)
  )[0];
  if (!member) throw new Error("member not created");
  const concert = (await db.select({ id: concerts.id }).from(concerts).limit(1))[0];
  if (!concert) throw new Error("no concert");

  let home = await loadHomeDashboard(member.id);
  if (home.concerts.length !== 0 || home.hiddenConcerts.length !== 0) {
    throw new Error("member should start empty");
  }

  await db.insert(concertAttendees).values({
    concertId: concert.id,
    userId: member.id,
    hidden: false,
    createdAt: new Date().toISOString(),
  });
  home = await loadHomeDashboard(member.id);
  const seen =
    home.concerts.some((c) => c.id === concert.id) ||
    home.hiddenConcerts.some((c) => c.id === concert.id);
  if (!seen) throw new Error("assigned concert missing from member home");
  console.log("attendance assignment ok");

  const res = await fetch(invite.url, { redirect: "manual" });
  console.log("magic HTTP", res.status, res.headers.get("location"));
  const setCookie =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const cookieHeader = res.headers.get("set-cookie") || "";
  const hasSession =
    setCookie.some((c) => c.startsWith("lkc_session=")) ||
    cookieHeader.includes("lkc_session=");
  console.log("session cookie set", hasSession);
  if (res.status !== 307 && res.status !== 302) {
    throw new Error("expected redirect from magic link");
  }
  if (!hasSession) throw new Error("expected lkc_session cookie");

  await db.delete(concertAttendees).where(eq(concertAttendees.userId, member.id));
  await db.delete(users).where(eq(users.id, member.id));
  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
