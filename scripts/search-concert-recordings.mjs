#!/usr/bin/env node
/**
 * Search YouTube for longer full-concert recordings ("Längere Mitschnitte").
 * Writes/merges into data/concert-recordings-found.json
 *
 * Usage: node scripts/search-concert-recordings.mjs [--concert id] [--force] [--limit N]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OTHER_CONCERTS } from "./live-konzert-companion-concerts.mjs";
import { CONCERT_RECORDINGS } from "./concert-recordings-other.mjs";
import enrichmentData from "../data/other-concerts-enrichment.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(root, "data", "concert-recordings-found.json");

const USER_AGENT = "Mozilla/5.0 (compatible; LiveKonzertCompanion/1.0; concert recording search)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_DURATION_SEC = 20 * 60;

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = Infinity;
  let concertId = null;
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit") limit = Number(args[++i]);
    else if (args[i] === "--concert") concertId = args[++i];
    else if (args[i] === "--force") force = true;
  }
  return { limit, concertId, force };
}

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function recordingSearchQueries({ artistName, city, venue, sort, title }) {
  const year = sort.slice(0, 4);
  const locations = [...new Set([venue, city].filter(Boolean))];
  const queries = [];
  for (const loc of locations) {
    queries.push(
      `${artistName} ${loc} ${year} full concert live`,
      `${artistName} live ${loc} ${year} full concert`,
      `${artistName} ${loc} ${year} komplett live`,
    );
  }
  queries.push(
    `${artistName} ${city || "Berlin"} ${year} full concert`,
    `${title} ${year} live full`,
    `${artistName} ${locations[0] || city} ${year} aftermovie`,
    `${artistName} ${year} live komplett`,
  );
  return [...new Set(queries)];
}

export function listRecordingSearchTasks({ concertId = null } = {}) {
  let concerts = OTHER_CONCERTS;
  if (concertId) concerts = concerts.filter((c) => c.id === concertId);

  return concerts.map((concert) => {
    const enrichment = enrichmentData[concert.id] || {};
    return {
      concertId: concert.id,
      artistName: concert.artistName,
      title: concert.title,
      city: enrichment.city || concert.city || "Berlin",
      venue: enrichment.venue || concert.venue || "",
      sort: concert.sort,
      manual: CONCERT_RECORDINGS[concert.id] || [],
    };
  });
}

function scoreHit(hit, task) {
  const title = (hit.title || "").toLowerCase();
  const year = task.sort.slice(0, 4);
  let score = 0;
  if (hit.lengthSeconds >= MIN_DURATION_SEC) score += 40;
  else if (hit.lengthSeconds >= 10 * 60) score += 20;
  if (title.includes("aftermovie")) score += 12;
  if (title.includes("full") || title.includes("komplett")) score += 15;
  if (title.includes("concert") || title.includes("live")) score += 10;
  if (title.includes(year)) score += 10;
  if (task.venue && title.includes(task.venue.toLowerCase().slice(0, 8))) score += 15;
  if (task.city && title.includes(task.city.toLowerCase())) score += 10;
  if (title.includes(task.artistName.toLowerCase())) score += 10;
  return score;
}

async function searchYouTubeVideos(query) {
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
      if (Array.isArray(data)) {
        return data.filter((v) => v.videoId && v.type === "video");
      }
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
    if (!res.ok) return [];
    const html = await res.text();
    const ids = [...new Set([...html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)].map((m) => m[1]))].filter(
      (id) => id !== "undefined",
    );
    return ids.slice(0, 8).map((videoId) => ({ videoId, type: "video", title: "", lengthSeconds: 0 }));
  } catch {
    return [];
  }
}

export async function findConcertRecording(task) {
  const queries = recordingSearchQueries(task);
  let best = null;
  for (const q of queries) {
    const hits = await searchYouTubeVideos(q);
    for (const hit of hits.slice(0, 8)) {
      const score = scoreHit(hit, task);
      if (!best || score > best.score) {
        best = {
          score,
          title: hit.title,
          url: `https://www.youtube.com/watch?v=${hit.videoId}`,
          duration: formatDuration(hit.lengthSeconds),
          lengthSeconds: hit.lengthSeconds || 0,
        };
      }
    }
    if (best?.score >= 55) break;
    await sleep(900);
  }
  if (!best || (best.lengthSeconds > 0 && best.lengthSeconds < 10 * 60)) return null;
  if (best.lengthSeconds === 0) {
    return { title: best.title || `${task.artistName} — Live (${task.sort})`, url: best.url, duration: "?" };
  }
  return { title: best.title, url: best.url, duration: best.duration || "?" };
}

function readJson(pathname, fallback) {
  if (!fs.existsSync(pathname)) return fallback;
  return JSON.parse(fs.readFileSync(pathname, "utf8"));
}

async function main() {
  const { limit, concertId, force } = parseArgs();
  const store = readJson(outPath, {});
  const tasks = listRecordingSearchTasks({ concertId });

  let searched = 0;
  let found = 0;
  let skipped = 0;

  for (const task of tasks) {
    if (task.manual.length && !force) {
      skipped++;
      continue;
    }
    if (store[task.concertId]?.length && !force) {
      skipped++;
      continue;
    }
    if (searched >= limit) break;

    const recording = await findConcertRecording(task);
    searched++;
    if (recording) {
      store[task.concertId] = [recording];
      found++;
      console.log("Found:", task.concertId, recording.url, recording.duration);
    } else {
      console.log("Miss:", task.concertId);
    }
    fs.writeFileSync(outPath, `${JSON.stringify(store, null, 2)}\n`);
    await sleep(700);
  }

  console.log("Done.", { searched, found, skipped, stored: Object.keys(store).length });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
