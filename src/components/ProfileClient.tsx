"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminInvitePanel, type UserRow } from "@/components/AdminInvitePanel";
import { logoutAction, updateOwnProfileAction } from "@/lib/auth-actions";

export function ProfileClient({
  user,
  users,
}: {
  user: { id: string; email: string; name: string; role: string };
  users: UserRow[];
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isAdmin = user.role === "admin";

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setBusy(true);
    try {
      await updateOwnProfileAction({ name, email });
      setMsg("Profil gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section>
        <div className="section-head">
          <h2>Profil</h2>
          <p className="section-desc">
            {isAdmin
              ? "Dein Account — unten verwaltest du Personen und Magic Links."
              : "Dein Account."}
          </p>
        </div>

        <form className="admin-form" onSubmit={saveProfile}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
          </label>
          <label>
            E-Mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <p className="admin-hint">Rolle: {isAdmin ? "Admin" : "Mitglied"}</p>
          <button type="submit" disabled={busy}>
            Speichern
          </button>
        </form>

        <p className="admin-msg" style={{ marginTop: "1rem" }}>
          <Link href="/admin">Konzert hinzufügen</Link>
        </p>

        <form action={logoutAction} className="profile-logout">
          <button type="submit" className="poster-modal-upload-btn">
            Abmelden
          </button>
        </form>
      </section>

      {error ? <p className="poster-modal-error">{error}</p> : null}
      {msg ? <p className="admin-msg">{msg}</p> : null}

      {isAdmin ? <AdminInvitePanel users={users} currentUserId={user.id} /> : null}
    </main>
  );
}
