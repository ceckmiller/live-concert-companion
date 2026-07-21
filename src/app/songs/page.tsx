import { SongsPageClient } from "@/components/SongsPageClient";
import { requireUser } from "@/lib/auth/session";
import { loadSongsDashboard } from "@/lib/queries";

export default async function SongsPage() {
  const user = await requireUser();
  const data = await loadSongsDashboard(user.id);
  return <SongsPageClient songs={data.songs} />;
}
