import { permanentRedirect, notFound } from "next/navigation";
import { ArtistPageClient } from "@/components/ArtistPageClient";
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

async function redirectPseudoOrArtist(artist: { id: string; slug: string }) {
  if (isFestivalArtist(artist.slug)) {
    const concertId = await findPseudoArtistTimelineConcertId(artist.slug);
    permanentRedirect(concertId ? `/#concert-${concertId}` : "/");
  }
  permanentRedirect(`/artist/${artist.id}`);
}

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureDbInitialized();
  const { slug } = await params;

  if (looksLikeUuid(slug)) {
    const data = await loadArtistById(slug);
    if (!data) notFound();
    if (isFestivalArtist(data.artist.slug)) {
      const concertId = await findPseudoArtistTimelineConcertId(data.artist.slug);
      permanentRedirect(concertId ? `/#concert-${concertId}` : "/");
    }
    return <ArtistPageClient data={data} />;
  }

  // Legacy slug URL → permanent redirect to stable UUID route
  let artist: { id: string; slug: string } | null = null;
  try {
    const db = getDb();
    artist = await findArtistBySlug(db, slug);
  } catch {
    artist = null;
  }

  if (artist) {
    await redirectPseudoOrArtist(artist);
  }

  const data = await loadArtistBySlug(slug);
  if (!data) notFound();
  await redirectPseudoOrArtist(data.artist);
}
