#!/usr/bin/env node
/**
 * Search YouTube for live footage of individual setlist songs from specific concerts.
 * Writes/merges results into:
 *   - data/concert-live-videos.json (OTHER_CONCERTS)
 *   - data/morrissey-live-videos.json (Morrissey shows)
 *
 * Usage: node scripts/search-concert-youtube.mjs [--limit N] [--concert id] [--force] [--missing-only]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OTHER_CONCERTS } from "./live-konzert-companion-concerts.mjs";
import enrichmentData from "../data/other-concerts-enrichment.json" with { type: "json" };
import {
  festivalAliasesForConcert,
  textMatchesSongLiveVideo,
} from "./concert-live-video-date.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(root, "data", "concert-live-videos.json");
const morrisseyOutPath = path.join(root, "data", "morrissey-live-videos.json");

const USER_AGENT = "Mozilla/5.0 (compatible; LiveKonzertCompanion/1.0; concert video search)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = Infinity;
  let concertId = null;
  let force = false;
  let missingOnly = !args.includes("--force");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit") limit = Number(args[++i]);
    else if (args[i] === "--concert") concertId = args[++i];
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--missing-only") missingOnly = true;
    else if (args[i] === "--all") missingOnly = false;
  }
  if (force) missingOnly = false;
  return { limit, concertId, force, missingOnly };
}

function loadMorrisseyConcerts() {
  const html = fs.readFileSync(path.join(root, "data", "morrissey-konzerte.html"), "utf8");
  const dataMatch = html.match(/const DATA = (\{[\s\S]*?\});/);
  if (!dataMatch) return [];
  const DATA = JSON.parse(dataMatch[1]);
  return DATA.concerts.map((c) => ({
    id: c.id,
    artistName: "Morrissey",
    city: c.city,
    sort: c.sort,
    setlist: c.setlist || [],
    existing: c.videos || {},
    morrissey: true,
  }));
}

export function concertBlocks(concert) {
  const enrichment = enrichmentData[concert.id] || {};
  if (enrichment.acts?.length) {
    return enrichment.acts
      .filter((a) => a.setlist?.length)
      .map((a) => ({
        artistName: a.artistName,
        city: enrichment.city || concert.city,
        venue: enrichment.venue || concert.venue || "",
        sort: concert.sort,
        setlist: a.setlist,
        existing: a.videos || {},
      }));
  }
  if (!enrichment.setlist?.length) return [];
  return [
    {
      artistName: concert.artistName,
      city: enrichment.city || concert.city,
      venue: enrichment.venue || concert.venue || "",
      sort: concert.sort,
      setlist: enrichment.setlist,
      existing: enrichment.videos || {},
    },
  ];
}

export function listSongSearchTasks({ concertId = null } = {}) {
  const tasks = [];
  let concerts = OTHER_CONCERTS;
  if (concertId && !concertId.startsWith("morrissey-")) {
    concerts = concerts.filter((c) => c.id === concertId);
  }

  for (const concert of concerts) {
    for (const block of concertBlocks(concert)) {
      for (const song of block.setlist) {
        tasks.push({
          store: "other",
          concertId: concert.id,
          artistName: block.artistName,
          city: block.city,
          venue: block.venue,
          sort: block.sort,
          song,
          existing: block.existing[song],
        });
      }
    }
  }

  const morrissey = loadMorrisseyConcerts();
  for (const concert of morrissey) {
    if (concertId && concertId !== concert.id && concertId !== `morrissey-${concert.id}`) continue;
    for (const song of concert.setlist) {
      tasks.push({
        store: "morrissey",
        concertId: concert.id,
        artistName: concert.artistName,
        city: concert.city,
        sort: concert.sort,
        song,
        existing: concert.existing[song],
      });
    }
  }
  return tasks;
}

async function searchYouTube(query) {
  const invidious = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yewtu.be",
  ];
  for (const base of invidious) {
    try {
      const url = `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const hit = data.find((v) => v.videoId && v.type === "video");
      if (hit?.videoId) return `https://www.youtube.com/watch?v=${hit.videoId}`;
    } catch {
      /* try next mirror */
    }
  }

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const ids = [...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]);
    const unique = [...new Set(ids)].filter((id) => id !== "undefined");
    return unique[0] ? `https://www.youtube.com/watch?v=${unique[0]}` : null;
  } catch (err) {
    console.warn("Search failed:", query, String(err?.message || err));
    return null;
  }
}

export function songVideoSearchQueries({ artistName, city, venue, sort, song, concertId = "" }) {
  const year = sort.slice(0, 4);
  const [y, m, d] = sort.split("-");
  const stripped = song.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  const locations = [...new Set([venue, city].filter(Boolean))];
  const queries = [];
  if (concertId.includes("madstock")) {
    queries.push(
      `${artistName} ${stripped} Live at Madstock 1992`,
      `${artistName} ${stripped} Madstock 1992`,
      `${artistName} ${stripped} Madstock Finsbury Park`,
    );
  }
  if (concertId.includes("voodoo-juergens")) {
    queries.push(
      `${artistName} ${stripped} live Astra Berlin 2026`,
      `${artistName} ${stripped} live Hamburg Mojo 2026`,
      `${artistName} ${stripped} live Dresden Beatpol 2026`,
      `${artistName} ${stripped} Ansa Panier live 2026`,
    );
  }
  for (const loc of locations) {
    queries.push(
      `${artistName} ${stripped} ${d}.${m}.${y} live ${loc}`,
      `${artistName} ${stripped} live ${loc} ${d}.${m}.${y}`,
      `${artistName} ${stripped} ${loc} ${year} live`,
      `${artistName} ${stripped} live ${loc} ${year}`,
    );
  }
  queries.push(
    `${artistName} ${stripped} ${d}.${m}.${y} live`,
    `${artistName} ${stripped} ${sort} live ${city}`,
    `${artistName} ${stripped} ${city} ${year} live`,
  );
  return [...new Set(queries)];
}

async function fetchVideoTitle(videoUrl) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
      { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) return "";
    const data = await res.json();
    return typeof data.title === "string" ? data.title : "";
  } catch {
    return "";
  }
}

export async function findSongVideo(task) {
  const festivalAliases = festivalAliasesForConcert(task.concertId);
  const queries = songVideoSearchQueries(task);
  for (const q of queries) {
    const url = await searchYouTube(q);
    if (!url) {
      await sleep(900);
      continue;
    }
    const title = await fetchVideoTitle(url);
    if (
      title &&
      textMatchesSongLiveVideo(title, task.song, task.sort, {
        festivalAliases,
        city: task.city,
        venue: task.venue,
      })
    ) {
      return url;
    }
    await sleep(900);
  }
  return null;
}

function readJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  return JSON.parse(fs.readFileSync(pathname, "utf8"));
}

async function main() {
  const { limit, concertId, force, missingOnly } = parseArgs();
  const otherStore = readJson(outPath, {});
  const morrisseyStore = readJson(morrisseyOutPath, {});
  const tasks = listSongSearchTasks({ concertId });

  let searched = 0;
  let found = 0;
  let skipped = 0;

  for (const task of tasks) {
    const store = task.store === "morrissey" ? morrisseyStore : otherStore;
    const current = store[task.concertId] || {};

    if (task.existing && !force) {
      current[task.song] = task.existing;
      store[task.concertId] = current;
      continue;
    }
    if (current[task.song] && !force) {
      skipped++;
      continue;
    }
    if (searched >= limit) break;

    const url = await findSongVideo(task);
    searched++;
    if (url) {
      current[task.song] = url;
      store[task.concertId] = current;
      found++;
      console.log("Found:", task.store, task.concertId, task.song, url);
    } else {
      console.log("Miss:", task.store, task.concertId, task.song);
    }
    await sleep(700);

    if (task.store === "morrissey") {
      fs.writeFileSync(morrisseyOutPath, `${JSON.stringify(morrisseyStore, null, 2)}\n`);
    } else {
      fs.writeFileSync(outPath, `${JSON.stringify(otherStore, null, 2)}\n`);
    }
  }

  fs.writeFileSync(outPath, `${JSON.stringify(otherStore, null, 2)}\n`);
  fs.writeFileSync(morrisseyOutPath, `${JSON.stringify(morrisseyStore, null, 2)}\n`);

  console.log(
    "Done.",
    { searched, found, skipped, otherConcerts: Object.keys(otherStore).length, morrisseyConcerts: Object.keys(morrisseyStore).length },
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
