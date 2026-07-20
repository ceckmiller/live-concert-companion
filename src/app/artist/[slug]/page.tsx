import { notFound } from "next/navigation";
import { ArtistPageClient } from "@/components/ArtistPageClient";
import { loadArtistBySlug } from "@/lib/queries";

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadArtistBySlug(slug);
  if (!data) notFound();

  return <ArtistPageClient data={data} />;
}
