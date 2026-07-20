# Live Konzert Companion

Persönliche Konzert-App mit Setlists, YouTube, Spotify — **Next.js + Turso + Drizzle + Netlify**.

## Lokal starten

```bash
cd "AI Projects/private Projekte/live-konzert-companion"
npm install
cp .env.example .env
npm run db:seed
npm run dev
```

- App: http://localhost:5174

Optional vor dem ersten Seed: `npm run assets:fetch` (Poster & Künstlerbilder nach `public/`).

## Deploy (Netlify + Turso)

Ausführliche Schritte: **[DEPLOY.md](./DEPLOY.md)**

Kurz:

1. Turso-DB anlegen, Env-Vars notieren
2. `TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:seed`
3. Netlify-Site verbinden, Env-Vars setzen, deployen

## Struktur

- `data/` — Konzert-Enrichment, Live-Videos, Poster-Overrides (Seed-Quellen)
- `src/lib/db/` — Drizzle-Schema & Turso-Client
- `scripts/seed.ts` — Morrissey + Ticket-Konzerte importieren
- `src/app/` — Next.js App Router (Dashboard, Künstler, Admin)
- `public/posters/`, `public/tickets/` — Bilder (im Git, im Build enthalten)

## Admin

Unter **Konzert hinzufügen**: Künstler + Datum (+ optional Venue/Stadt). setlist.fm-Suchlink wird automatisch hinterlegt.

Poster online: per **Suche** oder **URL** — Datei-Upload funktioniert nur lokal (kein persistentes Dateisystem auf Netlify).

## Tests

```bash
npm test
npm run build
```
