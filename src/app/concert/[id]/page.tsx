import Link from "next/link";
import { permanentRedirect, notFound } from "next/navigation";
import { ConcertPageClient } from "@/components/ConcertPageClient";
import { ConcertAttendeesPanel } from "@/components/ConcertAttendeesPanel";
import { isAdmin, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/init-db";
import { findConcertBySlug } from "@/lib/concert-lookup";
import { looksLikeUuid } from "@/lib/id";
import { listConcertAttendeeIds, loadConcertById } from "@/lib/queries";
import { listMemberUsersForPicker } from "@/lib/auth-actions";

export default async function ConcertPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureDbInitialized();
  const user = await requireUser();
  const { id } = await params;

  if (!looksLikeUuid(id)) {
    let concertId: string;
    try {
      const db = getDb();
      const found = await findConcertBySlug(db, id);
      concertId = found.concert.id;
    } catch {
      notFound();
    }
    permanentRedirect(`/concert/${concertId}`);
  }

  const data = await loadConcertById(id, user.id, { isAdmin: isAdmin(user) });
  if (!data) notFound();

  const [attendeeIds, allUsers] = await Promise.all([
    listConcertAttendeeIds(data.concert.id),
    listMemberUsersForPicker(),
  ]);
  const otherUsers = allUsers.filter((u) => u.id !== user.id);

  return (
    <>
      <nav>
        <Link href="/">← Chronologie</Link>
        <Link href={`/artist/${data.artist.id}`}>{data.artist.name}</Link>
      </nav>
      <main>
        <ConcertPageClient data={data} />
        <ConcertAttendeesPanel
          concertId={data.concert.id}
          users={otherUsers}
          selectedIds={attendeeIds}
          currentUserId={user.id}
        />
      </main>
    </>
  );
}
