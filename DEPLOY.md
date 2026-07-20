# Netlify-Deploy mit Turso

Gleicher Ablauf wie beim WM-Tippspiel: Next.js auf Netlify, Daten in Turso (libSQL).

## 1. Turso-Datenbank

1. Account auf [turso.tech](https://turso.tech)
2. Neue DB anlegen (z. B. `live-konzert-companion`)
3. `TURSO_DATABASE_URL` und `TURSO_AUTH_TOKEN` notieren

## 2. Schema & Konzerte seeden

Einmalig von deinem Rechner aus (nicht im Netlify-Build):

```bash
cd "AI Projects/private Projekte/live-konzert-companion"

# Optional: lokale Assets nach public/ holen (Poster, Künstlerbilder)
npm run assets:fetch

# Tabellen anlegen + 81 Konzerte importieren (löscht bestehende Daten!)
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:seed
```

`db:seed` erstellt alle Tabellen selbst — kein separates `db:push` nötig.

**Hinweis:** `db:seed` leert die DB und importiert neu. Für Updates lieber lokal entwickeln und gezielt seeden, oder später ein Incremental-Import bauen.

## 3. Netlify-Site

1. Repository/Ordner mit Netlify verbinden
2. **Base directory:** `live-konzert-companion` (falls Monorepo)
3. **Build command:** `npm run build` (siehe `netlify.toml`)
4. **Plugin:** `@netlify/plugin-nextjs` (bereits in `netlify.toml`)
5. **Environment Variables:**
   - `TURSO_DATABASE_URL` — als Secret
   - `TURSO_AUTH_TOKEN` — als Secret

Netlify setzt automatisch `NETLIFY=true` — damit erkennt die App serverless-Umgebungen.

## 4. Was online anders ist als lokal

| Feature | Lokal | Netlify |
|--------|-------|---------|
| Datenbank | `file:./local.db` | Turso (Remote) |
| Poster aus `public/posters/` | ✓ (im Git) | ✓ (im Build) |
| Poster-Datei-Upload (`/posters/uploads/`) | ✓ | ✗ — Suche/URL nutzen |
| Poster-Overrides in `data/user-poster-overrides.json` | ✓ (für Re-Seed) | DB ist maßgeblich |
| Admin: Konzert anlegen, Poster per URL, Crop | ✓ | ✓ |

## 5. Nach dem Deploy prüfen

- Startseite lädt Künstler/Konzerte
- Künstlerseite mit Setlist + Videos
- `/admin` — Konzert anlegen
- Poster bearbeiten per **Suche** oder **URL** (nicht Datei-Upload)

## 6. Lokale Entwicklung

```bash
cp .env.example .env
# TURSO_DATABASE_URL=file:./local.db
npm run db:seed
npm run dev
```

App: http://localhost:5174
