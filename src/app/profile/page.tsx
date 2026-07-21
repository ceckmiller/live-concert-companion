import { ProfileClient } from "@/components/ProfileClient";
import { listUsersAction } from "@/lib/auth-actions";
import { requireUser } from "@/lib/auth/session";

export default async function ProfilePage() {
  const user = await requireUser();
  const users = user.role === "admin" ? await listUsersAction() : [];
  return <ProfileClient user={user} users={users} />;
}
