#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ARTIST_WIKI, TOUR_WIKI, downloadUrl, fetchWikiThumbAny, slugifyFile } from "./wikipedia-assets.mjs";
import { ARTIST_DEEZER, ARTIST_ITUNES, TOUR_COVERART, TOUR_ITUNES, fetchCoverArtRelease, fetchDeezerArtistPicture, fetchItunesArtwork } from "./music-assets.mjs";
import { TOUR_POSTERS } from "./tour-posters.mjs";
import { ARTISTS } from "./live-konzert-companion-concerts.mjs";
import enrichment from "../data/other-concerts-enrichment.json" with { type: "json" };
import { buildTourPosterQueries, searchTourPosterWithQueries } from "./tour-poster-search.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadWithRetry(url, dest, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await downloadUrl(url, dest);
      return true;
    } catch (err) {
      const msg = String(err?.message || err);
      if (attempt < 3 && (msg.includes("429") || msg.includes("503"))) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      console.warn("Skip", label, msg);
      return false;
    }
  }
  return false;
}

function mapMorrisseyPosters(posterDir, manifest) {
  const html = fs.readFileSync(path.join(root, "data", "morrissey-konzerte.html"), "utf8");
  const dataMatch = html.match(/const DATA = (\{[\s\S]*?\});/);
  if (!dataMatch) return;
  const DATA = JSON.parse(dataMatch[1]);
  for (const [tourName, tour] of Object.entries(DATA.tours)) {
    const rel = (tour.poster || "").replace(/^morrissey-posters\//, "");
    if (!rel) continue;
    const local = path.join(posterDir, rel);
    if (fs.existsSync(local)) {
      manifest.morrisseyTours[tourName] = `/posters/${rel}`;
    }
  }
  for (const c of DATA.concerts) {
    if (!c.poster) continue;
    const rel = c.poster.replace(/^morrissey-posters\//, "");
    const local = path.join(posterDir, rel);
    if (fs.existsSync(local) && !manifest.morrisseyTours[c.tour]) {
      manifest.morrisseyTours[c.tour] = `/posters/${rel}`;
    }
  }
}

async function fetchArtistImage(slug, wikiEntries) {
  const wiki = await fetchWikiThumbAny(wikiEntries);
  if (wiki) return wiki;
  const deezerQuery = ARTIST_DEEZER[slug];
  if (deezerQuery) {
    const deezer = await fetchDeezerArtistPicture(deezerQuery);
    if (deezer) return deezer;
  }
  const itunesQuery = ARTIST_ITUNES[slug];
  if (itunesQuery) return fetchItunesArtwork(itunesQuery);
  return null;
}

async function fetchTourPoster(key, wiki) {
  const wikiThumb = wiki ? await fetchWikiThumbAny(wiki) : null;
  if (wikiThumb) return wikiThumb;
  const itunesQuery = TOUR_ITUNES[key];
  if (itunesQuery) {
    const itunes = await fetchItunesArtwork(itunesQuery);
    if (itunes) return itunes;
  }
  const releaseId = TOUR_COVERART[key];
  if (releaseId) return fetchCoverArtRelease(releaseId);
  return null;
}

const artistNames = Object.fromEntries(ARTISTS.map((artist) => [artist.id, artist.name]));
const tourYears = new Map();
for (const [concertId, entry] of Object.entries(enrichment)) {
  if (!entry.tour) continue;
  const artistSlug = concertId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  const year = concertId.match(/(\d{4})-\d{2}-\d{2}/)?.[1];
  const key = `${artistSlug}:${entry.tour}`;
  if (year && !tourYears.has(key)) tourYears.set(key, year);
}

function collectTourKeys() {
  const keys = new Set();
  for (const [artistSlug, tours] of Object.entries(TOUR_WIKI)) {
    for (const tourName of Object.keys(tours)) keys.add(`${artistSlug}:${tourName}`);
  }
  for (const [artistSlug, tours] of Object.entries(TOUR_POSTERS)) {
    for (const tourName of Object.keys(tours)) keys.add(`${artistSlug}:${tourName}`);
  }
  for (const [concertId, entry] of Object.entries(enrichment)) {
    if (!entry.tour) continue;
    const artistSlug = concertId.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    keys.add(`${artistSlug}:${entry.tour}`);
  }
  return [...keys].sort();
}

function splitTourKey(key) {
  const splitAt = key.indexOf(":");
  return { artistSlug: key.slice(0, splitAt), tourName: key.slice(splitAt + 1) };
}

async function resolvePosterSource(key) {
  const { artistSlug, tourName } = splitTourKey(key);
  const curated = TOUR_POSTERS[artistSlug]?.[tourName];
  const artistName = artistNames[artistSlug] || artistSlug;
  const year = tourYears.get(key) || tourName.match(/\b(19|20)\d{2}\b/)?.[0] || "";

  if (curated?.kind === "poster" && curated.poster?.startsWith("http")) {
    return { url: curated.poster, source: "curated", label: curated.label, kind: "poster" };
  }

  const query = buildTourPosterQueries(artistName, tourName, year);
  const searched = await searchTourPosterWithQueries(query, {
    artistName,
    tourName,
    expectedYear: year,
  });
  if (searched) {
    return {
      url: searched.url,
      source: "search",
      label: `Tourplakat: ${tourName}${year ? ` (${year})` : ""}`,
      kind: "poster",
      query: searched.query,
      score: searched.score,
      title: searched.title,
    };
  }

  if (curated?.poster?.startsWith("http")) {
    return { url: curated.poster, source: "album", label: curated.label, kind: curated.kind || "album" };
  }

  const wiki = TOUR_WIKI[artistSlug]?.[tourName];
  const fallback = await fetchTourPoster(key, wiki);
  if (fallback) {
    return { url: fallback, source: "wiki-itunes", label: curated?.label || tourName, kind: curated?.kind || "album" };
  }

  return null;
}

async function main() {
  const artistDir = path.join(publicDir, "artists");
  const posterDir = path.join(publicDir, "posters");
  fs.mkdirSync(artistDir, { recursive: true });
  fs.mkdirSync(posterDir, { recursive: true });

  const manifest = { artists: {}, posters: {}, morrisseyTours: {} };

  for (const [slug, wikiEntries] of Object.entries(ARTIST_WIKI)) {
    const dest = path.join(artistDir, `${slug}.jpg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 5000) {
      manifest.artists[slug] = `/artists/${slug}.jpg`;
      continue;
    }
    const thumb = await fetchArtistImage(slug, wikiEntries);
    if (!thumb) {
      console.warn("No image:", slug);
      await sleep(250);
      continue;
    }
    const ok = await downloadWithRetry(thumb, dest, `artist:${slug}`);
    if (ok) {
      manifest.artists[slug] = `/artists/${slug}.jpg`;
      console.log("Artist:", slug);
    }
    await sleep(300);
  }

  const searchCache = {};
  const forcePosters = process.argv.includes("--force-posters");

  for (const key of collectTourKeys()) {
    const { artistSlug, tourName } = splitTourKey(key);
    const file = `${artistSlug}--${slugifyFile(tourName)}.jpg`;
    const dest = path.join(posterDir, file);

    const hadPoster = fs.existsSync(dest) && fs.statSync(dest).size > 5000;
    if (!forcePosters && hadPoster) {
      manifest.posters[key] = `/posters/${file}`;
      continue;
    }

    const source = await resolvePosterSource(key);
    if (!source?.url) {
      if (hadPoster) manifest.posters[key] = `/posters/${file}`;
      else console.warn("No poster:", key);
      await sleep(250);
      continue;
    }

    const ok = await downloadWithRetry(source.url, dest, `poster:${key}`);
    if (!ok) {
      if (hadPoster) manifest.posters[key] = `/posters/${file}`;
      continue;
    }

    manifest.posters[key] = `/posters/${file}`;
    console.log(`Poster (${source.source}):`, key);

    if (source.source === "search") {
      searchCache[key] = {
        query: source.query,
        score: source.score,
        title: source.title,
        label: source.label,
        kind: "poster",
      };
    }

    await sleep(450);
  }

  for (const [artistSlug, tours] of Object.entries(TOUR_POSTERS)) {
    for (const [tourName, info] of Object.entries(tours)) {
      if (info.poster?.startsWith("http")) continue;
      const file = `${artistSlug}--${slugifyFile(tourName)}.jpg`;
      const dest = path.join(posterDir, file);
      const key = `${artistSlug}:${tourName}`;
      if (fs.existsSync(dest) && fs.statSync(dest).size > 5000) {
        manifest.posters[key] = `/posters/${file}`;
      }
    }
  }

  fs.writeFileSync(path.join(root, "data/tour-poster-search-cache.json"), JSON.stringify(searchCache, null, 2));

  mapMorrisseyPosters(posterDir, manifest);

  for (const file of fs.readdirSync(artistDir)) {
    if (file.endsWith(".jpg")) {
      manifest.artists[file.replace(/\.jpg$/, "")] = `/artists/${file}`;
    }
  }

  fs.writeFileSync(path.join(root, "data/asset-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("Done.", {
    artists: Object.keys(manifest.artists).length,
    posters: Object.keys(manifest.posters).length,
    morrisseyTours: Object.keys(manifest.morrisseyTours).length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
