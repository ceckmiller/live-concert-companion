import { permanentRedirect, notFound } from "next/navigation";
import { ArtistPageClient } from "@/components/ArtistPageClient";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ensureDbInitialized } from "@/lib/init-db";
import { findArtistBySlug } from "@/lib/concert-lookup";
import { looksLikeUuid } from "@/lib/id";
import { isFestivalArtist } from "@/lib/festivals";
import {
  findPseudoArtistTimelineConcertId,
  loadArtistById,
  loadArtistBySlug,
} from "@/lib/queries";

async function redirectPseudoOrArtist(
  artist: { id: string; slug: string },
  userId: string,
) {
  if (isFestivalArtist(artist.slug)) {
    const concertId = await findPseudoArtistTimelineConcertId(artist.slug, userId);
    permanentRedirect(concertId ? `/#concert-${concertId}` : "/");
  }
  permanentRedirect(`/artist/${artist.id}`);
}

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureDbInitialized();
  const user = await requireUser();
  const { slug } = await params;

  if (looksLikeUuid(slug)) {
    const data = await loadArtistById(slug, user.id);
    if (!data) notFound();
    if (isFestivalArtist(data.artist.slug)) {
      const concertId = await findPseudoArtistTimelineConcertId(data.artist.slug, user.id);
      permanentRedirect(concertId ? `/#concert-${concertId}` : "/");
    }
    return <ArtistPageClient data={data} />;
  }

  let artist: { id: string; slug: string } | null = null;
  try {
    const db = getDb();
    artist = await findArtistBySlug(db, slug);
  } catch {
    artist = null;
  }

  if (artist) {
    await redirectPseudoOrArtist(artist, user.id);
  }

  const data = await loadArtistBySlug(slug, user.id);
  if (!data) notFound();
  await redirectPseudoOrArtist(data.artist, user.id);
}
