#!/usr/bin/env node
/**
 * Merge flat concert-live-videos.json hits into other-concerts-enrichment.json act.videos / videos.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const enrichmentPath = path.join(root, "data", "other-concerts-enrichment.json");
const livePath = path.join(root, "data", "concert-live-videos.json");

const enrichment = JSON.parse(fs.readFileSync(enrichmentPath, "utf8"));
const live = JSON.parse(fs.readFileSync(livePath, "utf8"));

for (const [concertId, videos] of Object.entries(live)) {
  const entry = enrichment[concertId];
  if (!entry || !videos || typeof videos !== "object") continue;

  if (entry.acts?.length) {
    for (const act of entry.acts) {
      if (!act.setlist?.length) continue;
      act.videos = act.videos || {};
      for (const song of act.setlist) {
        if (videos[song]) act.videos[song] = videos[song];
      }
    }
  } else if (entry.setlist?.length) {
    entry.videos = entry.videos || {};
    for (const song of entry.setlist) {
      if (videos[song]) entry.videos[song] = videos[song];
    }
  }
}

fs.writeFileSync(enrichmentPath, `${JSON.stringify(enrichment, null, 2)}\n`);
console.log("Merged live videos into enrichment for", Object.keys(live).length, "concerts");
