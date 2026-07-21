"use client";

import { useActionState, useState } from "react";
import {
  loginWithPasswordAction,
  requestLoginLinkAction,
  type LoginPasswordState,
} from "@/lib/auth-actions";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [magicError, setMagicError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordState, passwordAction, passwordPending] = useActionState<
    LoginPasswordState,
    FormData
  >(loginWithPasswordAction, null);

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setMagicError("");
    setLink("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("email", email);
      const res = await requestLoginLinkAction(fd);
      setLink(res.url);
    } catch (err) {
      setMagicError(err instanceof Error ? err.message : "Login fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section>
        <div className="section-head">
          <h2>Admin-Login</h2>
          <p className="section-desc">Mit Benutzername und Passwort anmelden.</p>
        </div>
        <form className="admin-form" action={passwordAction}>
          <label>
            Benutzername
            <input
              name="username"
              defaultValue="admin"
              required
              autoComplete="username"
              disabled={passwordPending}
            />
          </label>
          <label>
            Passwort
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={passwordPending}
            />
          </label>
          <button type="submit" disabled={passwordPending}>
            {passwordPending ? "Anmelden …" : "Anmelden"}
          </button>
        </form>
        {passwordState?.error ? (
          <p className="poster-modal-error" role="alert">
            {passwordState.error}
          </p>
        ) : null}
      </section>

      <section>
        <div className="section-head">
          <h2>Magic Link</h2>
          <p className="section-desc">
            Für eingeladene Personen — lokal wird der Link hier angezeigt.
          </p>
        </div>
        <form className="admin-form" onSubmit={onMagicLink}>
          <label>
            E-Mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="freund@example.com"
              disabled={busy}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Link wird erstellt …" : "Magic Link holen"}
          </button>
        </form>
        {link ? (
          <p className="admin-msg">
            Dein Login-Link: <a href={link}>{link}</a>
          </p>
        ) : null}
      </section>

      {magicError && !passwordState?.error ? (
        <p className="poster-modal-error" role="alert">
          {magicError}
        </p>
      ) : null}
    </main>
  );
}
