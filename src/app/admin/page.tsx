import { AdminForm } from "@/components/AdminForm";
import { requireUser } from "@/lib/auth/session";

/** Any logged-in user (inkl. Magic-Link-Mitglieder) kann Konzerte anlegen. */
export default async function AdminPage() {
  await requireUser();
  return <AdminForm />;
}
