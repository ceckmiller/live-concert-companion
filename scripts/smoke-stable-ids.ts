#!/usr/bin/env tsx
import { createClient } from "@libsql/client";

const base = process.env.SMOKE_BASE_URL ?? "http://localhost:5174";
const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createClient(url.startsWith("file:") ? { url } : { url, authToken: authToken ?? "" });

async function head(path: string) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  return {
    path,
    status: res.status,
    location: res.headers.get("location"),
  };
}

async function main() {
  const artist = await db.execute(`SELECT id FROM artists WHERE slug='placebo' LIMIT 1`);
  const madstock = await db.execute(
    `SELECT id FROM concerts WHERE slug='madstock-1992-08-08' LIMIT 1`,
  );
  const artistId = String(artist.rows[0]?.id ?? "");
  const madstockId = String(madstock.rows[0]?.id ?? "");
  if (!artistId || !madstockId) throw new Error("missing fixture ids");

  const checks = await Promise.all([
    head(`/artist/${artistId}`),
    head(`/artist/placebo`),
    head(`/concert/${madstockId}`),
    head(`/artist/madstock`),
    head(`/concert/madstock-1992-08-08`),
  ]);
  for (const c of checks) console.log(c);

  const home = await fetch(`${base}/`);
  const html = await home.text();
  console.log({
    homeStatus: home.status,
    hasMultiActBadge: html.includes("Multi-Act"),
    hasConcertUuidLink: /\/concert\/[0-9a-f-]{36}/i.test(html),
    hasFestivalsSection: /id=["']festivals["']/.test(html),
    chronologyDesc: html.includes("Multi-Act-Events"),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
