#!/usr/bin/env node
/**
 * Validate all stored per-concert live video links (date + city/venue + song in title).
 * Rewrites data/concert-live-videos.json, data/morrissey-live-videos.json,
 * and act videos in data/other-concerts-enrichment.json.
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
const otherPath = path.join(root, "data", "concert-live-videos.json");
const morrisseyPath = path.join(root, "data", "morrissey-live-videos.json");
const enrichmentPath = path.join(root, "data", "other-concerts-enrichment.json");
const USER_AGENT = "Mozilla/5.0 (compatible; LiveKonzertCompanion/1.0; video sanitize)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadMorrisseyConcerts() {
  const html = fs.readFileSync(path.join(root, "data", "morrissey-konzerte.html"), "utf8");
  const dataMatch = html.match(/const DATA = (\{[\s\S]*?\});/);
  if (!dataMatch) return [];
  const DATA = JSON.parse(dataMatch[1]);
  return DATA.concerts.map((c) => ({
    id: c.id,
    sort: c.sort,
    city: c.city,
    venue: c.venue,
    setlist: c.setlist || [],
  }));
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

function concertMeta(concertId) {
  const other = OTHER_CONCERTS.find((c) => c.id === concertId);
  if (other) {
    const enrichment = enrichmentData[concertId] || {};
    return {
      sort: other.sort,
      city: enrichment.city || other.city || "",
      venue: enrichment.venue || other.venue || "",
      festivalAliases: festivalAliasesForConcert(concertId),
    };
  }
  const morrissey = loadMorrisseyConcerts().find((c) => c.id === concertId);
  if (morrissey) {
    return {
      sort: morrissey.sort,
      city: morrissey.city || "",
      venue: morrissey.venue || "",
      festivalAliases: [],
    };
  }
  return null;
}

async function validateEntry(concertId, song, url, titleCache) {
  const meta = concertMeta(concertId);
  if (!meta) return false;
  if (!titleCache.has(url)) {
    titleCache.set(url, await fetchVideoTitle(url));
    await sleep(120);
  }
  const title = titleCache.get(url) || "";
  return textMatchesSongLiveVideo(title, song, meta.sort, {
    festivalAliases: meta.festivalAliases,
    city: meta.city,
    venue: meta.venue,
  });
}

async function sanitizeStore(store, label) {
  let kept = 0;
  let dropped = 0;
  const titleCache = new Map();
  /** @type {Record<string, Record<string, string>>} */
  const out = {};

  for (const [concertId, videos] of Object.entries(store)) {
    /** @type {Record<string, string>} */
    const cleaned = {};
    for (const [song, url] of Object.entries(videos || {})) {
      if (await validateEntry(concertId, song, url, titleCache)) {
        cleaned[song] = url;
        kept++;
      } else {
        dropped++;
        console.log("drop", label, concertId, song, url);
      }
    }
    if (Object.keys(cleaned).length) out[concertId] = cleaned;
  }

  return { out, kept, dropped };
}

async function sanitizeEnrichmentActs(titleCache) {
  let kept = 0;
  let dropped = 0;
  const enrichment = structuredClone(enrichmentData);

  for (const [concertId, entry] of Object.entries(enrichment)) {
    if (!entry.acts?.length) continue;
    const meta = concertMeta(concertId);
    if (!meta) continue;
    for (const act of entry.acts) {
      if (!act.videos) continue;
      /** @type {Record<string, string>} */
      const cleaned = {};
      for (const [song, url] of Object.entries(act.videos)) {
        if (!titleCache.has(url)) {
          titleCache.set(url, await fetchVideoTitle(url));
          await sleep(120);
        }
        const title = titleCache.get(url) || "";
        if (
          textMatchesSongLiveVideo(title, song, meta.sort, {
            festivalAliases: meta.festivalAliases,
            city: meta.city,
            venue: meta.venue,
          })
        ) {
          cleaned[song] = url;
          kept++;
        } else {
          dropped++;
          console.log("drop act", concertId, act.artistId, song, url);
        }
      }
      act.videos = Object.keys(cleaned).length ? cleaned : undefined;
      if (!act.videos) delete act.videos;
    }
  }

  fs.writeFileSync(enrichmentPath, `${JSON.stringify(enrichment, null, 2)}\n`);
  return { kept, dropped };
}

async function main() {
  const otherStore = JSON.parse(fs.readFileSync(otherPath, "utf8"));
  const morrisseyStore = JSON.parse(fs.readFileSync(morrisseyPath, "utf8"));
  const titleCache = new Map();

  const other = await sanitizeStore(otherStore, "other");
  fs.writeFileSync(otherPath, `${JSON.stringify(other.out, null, 2)}\n`);

  const morrissey = await sanitizeStore(morrisseyStore, "morrissey");
  fs.writeFileSync(morrisseyPath, `${JSON.stringify(morrissey.out, null, 2)}\n`);

  const acts = await sanitizeEnrichmentActs(titleCache);

  console.log("Done.", {
    other: { kept: other.kept, dropped: other.dropped, concerts: Object.keys(other.out).length },
    morrissey: { kept: morrissey.kept, dropped: morrissey.dropped, concerts: Object.keys(morrissey.out).length },
    acts,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
