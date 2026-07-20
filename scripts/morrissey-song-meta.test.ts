import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { SONG_META } from "./morrissey-song-meta.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, "..", "data", "morrissey-konzerte.html");

function concertSongs(): string[] {
  const html = fs.readFileSync(htmlPath, "utf8");
  const m = html.match(/const DATA = (\{[\s\S]*?\});/);
  if (!m) throw new Error("DATA block missing");
  const data = JSON.parse(m[1]) as { concerts: { setlist: string[] }[] };
  const songs = new Set<string>();
  data.concerts.forEach((c) => c.setlist.forEach((s) => songs.add(s)));
  return [...songs];
}

describe("morrissey song metadata", () => {
  it("covers every song in concert setlists", () => {
    const missing = concertSongs().filter((song) => !SONG_META[song]);
    expect(missing).toEqual([]);
  });

  it("uses only known origin types", () => {
    const allowed = new Set(["morrissey", "smiths", "cover"]);
    const bad = Object.entries(SONG_META).filter(([, m]) => !allowed.has(m.origin));
    expect(bad).toEqual([]);
  });

  it("requires album and original artist for covers", () => {
    const covers = Object.entries(SONG_META).filter(([, m]) => m.origin === "cover");
    expect(covers.length).toBeGreaterThan(0);
    for (const [song, m] of covers) {
      expect(m.album, `${song} album`).toBeTruthy();
      expect(m.by, `${song} by`).toBeTruthy();
    }
  });

  it("includes release year for every song", () => {
    for (const [song, m] of Object.entries(SONG_META)) {
      expect(m.year, `${song} year`).toBeTypeOf("number");
      expect(m.year, `${song} year`).toBeGreaterThan(1900);
    }
  });
});

describe("morrissey official youtube videos", () => {
  it("only uses youtube watch URLs for known songs", async () => {
    const { OFFICIAL_VIDEOS } = await import("./morrissey-official-videos.mjs");
    const songs = concertSongs();
    for (const [song, url] of Object.entries(OFFICIAL_VIDEOS)) {
      expect(songs, `${song} should be in setlists`).toContain(song);
      expect(url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]+$/);
    }
  });
});
