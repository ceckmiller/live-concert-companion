import { HomePageClient } from "@/components/HomePageClient";
import { requireUser } from "@/lib/auth/session";
import { loadHomeDashboard } from "@/lib/queries";

export default async function ArtistsPage() {
  const user = await requireUser();
  const home = await loadHomeDashboard(user.id);
  return <HomePageClient home={home} artistsOnly />;
}
