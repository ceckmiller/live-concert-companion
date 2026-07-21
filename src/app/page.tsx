import Link from "next/link";
import { HomePageClient } from "@/components/HomePageClient";
import { requireUser } from "@/lib/auth/session";
import { loadHomeDashboard } from "@/lib/queries";

export default async function HomePage() {
  const user = await requireUser();
  const home = await loadHomeDashboard(user.id);
  return (
    <>
      <div className="page-actions">
        <Link href="/admin" className="page-action-btn">
          Konzert hinzufügen
        </Link>
      </div>
      <HomePageClient home={home} timelineOnly />
    </>
  );
}
