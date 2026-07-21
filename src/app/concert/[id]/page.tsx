import Link from "next/link";
import { permanentRedirect, notFound } from "next/navigation";
import { ConcertPageClient } from "@/components/ConcertPageClient";
import { getDb } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/init-db";
import { findConcertBySlug } from "@/lib/concert-lookup";
import { looksLikeUuid } from "@/lib/id";
import { loadConcertById } from "@/lib/queries";

export default async function ConcertPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureDbInitialized();
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

  const data = await loadConcertById(id);
  if (!data) notFound();

  return (
    <>
      <nav>
        <Link href="/">← Chronologie</Link>
        <Link href={`/artist/${data.artist.id}`}>{data.artist.name}</Link>
      </nav>
      <main>
        <ConcertPageClient data={data} />
      </main>
    </>
  );
}
