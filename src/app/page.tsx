import { HomePageClient } from "@/components/HomePageClient";
import { loadHomeDashboard } from "@/lib/queries";

export default async function HomePage() {
  const home = await loadHomeDashboard();
  return <HomePageClient home={home} />;
}
