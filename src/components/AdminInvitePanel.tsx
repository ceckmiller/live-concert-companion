"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteUserAction,
  inviteUserAction,
  updateUserAction,
} from "@/lib/auth-actions";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

export function AdminInvitePanel({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");

  function clearFlash() {
    setError("");
    setMsg("");
    setInviteUrl("");
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    clearFlash();
    setBusy(true);
    try {
      const res = await inviteUserAction({ email: inviteEmail, name: inviteName });
      setInviteUrl(res.url);
      setMsg(`Angelegt: ${res.name} (${res.email}). Magic Link zum Verschicken:`);
      setInviteEmail("");
      setInviteName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anlegen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(u: UserRow) {
    clearFlash();
    setEditingId(u.id);
    setEditName(u.name);
    setEditEmail(u.email);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    clearFlash();
    setBusy(true);
    try {
      const updated = await updateUserAction({
        id: editingId,
        name: editName,
        email: editEmail,
      });
      setMsg(`Gespeichert: ${updated.name} (${updated.email})`);
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function makeLinkForUser(u: UserRow) {
    clearFlash();
    setBusy(true);
    try {
      const res = await inviteUserAction({ email: u.email, name: u.name });
      setInviteUrl(res.url);
      setMsg(`Neuer Magic Link für ${u.name}:`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(u: UserRow) {
    if (u.id === currentUserId) {
      setError("Eigenen Account kannst du nicht löschen");
      return;
    }
    if (u.role === "admin") {
      setError("Admin-Account kann nicht gelöscht werden");
      return;
    }
    if (!window.confirm(`„${u.name}“ wirklich löschen?`)) return;
    clearFlash();
    setBusy(true);
    try {
      await deleteUserAction(u.id);
      setMsg(`${u.name} wurde gelöscht.`);
      if (editingId === u.id) setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>Personen & Magic Links</h2>
        <p className="section-desc">
          Personen anlegen, bearbeiten, löschen — und Magic Links zum Einloggen verschicken.
        </p>
      </div>

      <form className="admin-form" onSubmit={invite}>
        <label>
          Name
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Freund:in"
            disabled={busy}
          />
        </label>
        <label>
          E-Mail
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            placeholder="freund@example.com"
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Anlegen …" : "Person anlegen + Magic Link"}
        </button>
      </form>

      {inviteUrl ? (
        <p className="admin-msg">
          {msg ? `${msg} ` : null}
          <a href={inviteUrl} style={{ wordBreak: "break-all" }}>
            {inviteUrl}
          </a>
        </p>
      ) : msg ? (
        <p className="admin-msg">{msg}</p>
      ) : null}
      {error ? <p className="poster-modal-error">{error}</p> : null}

      <div className="section-head" style={{ marginTop: "1.5rem" }}>
        <h2>Alle Personen</h2>
      </div>
      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id} className="user-list-item">
            {editingId === u.id ? (
              <form className="admin-form user-edit-form" onSubmit={saveEdit}>
                <label>
                  Name
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
                <label>
                  E-Mail
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
                <div className="user-list-actions">
                  <button type="submit" disabled={busy}>
                    Speichern
                  </button>
                  <button
                    type="button"
                    className="page-action-btn"
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="user-list-meta">
                  <strong>{u.name}</strong>
                  <span className="muted"> — {u.email}</span>
                  {u.role === "admin" ? " · Admin" : ""}
                  {u.id === currentUserId ? " · du" : ""}
                </div>
                <div className="user-list-actions">
                  <button
                    type="button"
                    className="page-action-btn"
                    disabled={busy}
                    onClick={() => startEdit(u)}
                  >
                    Bearbeiten
                  </button>
                  {u.role !== "admin" ? (
                    <button
                      type="button"
                      className="page-action-btn"
                      disabled={busy}
                      onClick={() => makeLinkForUser(u)}
                    >
                      Magic Link
                    </button>
                  ) : null}
                  {u.role !== "admin" && u.id !== currentUserId ? (
                    <button
                      type="button"
                      className="page-action-btn user-delete-btn"
                      disabled={busy}
                      onClick={() => removeUser(u)}
                    >
                      Löschen
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
