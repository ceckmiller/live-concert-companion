import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as schema from "./db/schema";

vi.mock("./db", () => ({ getDb: () => testDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./auth/session", () => ({ requireUser: vi.fn(async () => ({ id: "member", role: "member" })) }));
vi.mock("./setlist-fm-fetch", () => ({ fetchSetlistFromSetlistFm: vi.fn() }));
vi.mock("../../scripts/search-concert-youtube.mjs", () => ({ findSongVideo: vi.fn() }));
vi.mock("../../scripts/search-concert-reviews.mjs", () => ({ findConcertReviews: vi.fn() }));
vi.mock("../../scripts/search-concert-recordings.mjs", () => ({ findConcertRecording: vi.fn() }));

import { requireUser } from "./auth/session";
import { fetchSetlistFromSetlistFm } from "./setlist-fm-fetch";
import { findSongVideo } from "../../scripts/search-concert-youtube.mjs";
import { findConcertReviews } from "../../scripts/search-concert-reviews.mjs";
import { findConcertRecording } from "../../scripts/search-concert-recordings.mjs";
import { getConcertRefreshSnapshot, applyConcertRefresh } from "./concert-refresh-actions";
import { concertRefreshChanges, hasConcertRefreshChanges, type ConcertRefreshProposal } from "./concert-refresh";
import { runConcertRefresh } from "./run-concert-refresh";

const testDir = mkdtempSync(path.join(tmpdir(), "concert-refresh-test-"));
const client = createClient({ url: `file:${path.join(testDir, "test.db")}` });
const testDb = drizzle(client, { schema });
const setlistFmUrl = "https://www.setlist.fm/setlist/test/2026/berlin-123.html";

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE artists (id TEXT PRIMARY KEY, slug TEXT, name TEXT, image_path TEXT, created_at TEXT);
    CREATE TABLE concerts (id TEXT PRIMARY KEY, artist_id TEXT, slug TEXT, sort_date TEXT, date_label TEXT, city TEXT DEFAULT '', venue TEXT DEFAULT '', tour_name TEXT DEFAULT '', note TEXT, poster_path TEXT, poster_crop_json TEXT, poster_label TEXT, setlist_fm_url TEXT, ticket_image_path TEXT, hidden INTEGER DEFAULT 0, event_kind TEXT DEFAULT 'solo', event_title TEXT, created_at TEXT);
    CREATE TABLE setlist_items (concert_id TEXT, position INTEGER, song_title TEXT, PRIMARY KEY (concert_id, position));
    CREATE TABLE concert_videos (concert_id TEXT, song_title TEXT, url TEXT, PRIMARY KEY (concert_id, song_title));
    CREATE TABLE reviews (id TEXT PRIMARY KEY, concert_id TEXT, title TEXT, url TEXT, source TEXT DEFAULT '');
    CREATE TABLE recordings (id TEXT PRIMARY KEY, concert_id TEXT, title TEXT, url TEXT, duration TEXT DEFAULT '');
    CREATE TABLE concert_acts (id TEXT PRIMARY KEY, concert_id TEXT, position INTEGER, artist_slug TEXT, artist_name TEXT, setlist_fm_url TEXT, note TEXT, setlist_complete INTEGER DEFAULT 1, setlist_json TEXT, videos_json TEXT DEFAULT '{}');
  `);
});

afterAll(() => {
  client.close();
  rmSync(testDir, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.clearAllMocks();
  await client.executeMultiple("DELETE FROM concert_acts; DELETE FROM recordings; DELETE FROM reviews; DELETE FROM concert_videos; DELETE FROM setlist_items; DELETE FROM concerts; DELETE FROM artists;");
  await testDb.insert(schema.artists).values({ id: "artist", slug: "test", name: "Test Artist", createdAt: "2026-01-01" });
  await testDb.insert(schema.concerts).values({ id: "concert", artistId: "artist", slug: "test-2026-12-01", sortDate: "2026-12-01", dateLabel: "01.12.2026", city: "Berlin", venue: "Test Venue", createdAt: "2026-01-01" });
  await testDb.insert(schema.setlistItems).values({ concertId: "concert", position: 1, songTitle: "Existing song" });
  await testDb.insert(schema.concertVideos).values({ concertId: "concert", songTitle: "Existing song", url: "/videos/uploads/mine.mp4" });
  vi.mocked(fetchSetlistFromSetlistFm).mockResolvedValue({ setlistFmUrl, songs: ["New song", "Existing song", "New song"] });
  vi.mocked(findSongVideo).mockResolvedValue("https://www.youtube.com/watch?v=new");
  vi.mocked(findConcertReviews).mockResolvedValue([{ title: "Live review", url: "https://example.com/review", source: "Example" }]);
  vi.mocked(findConcertRecording).mockResolvedValue({ title: "Full show", url: "https://www.youtube.com/watch?v=full", duration: "90:00" });
});

describe("concert information refresh", () => {
  it("fills a concert that was created without a setlist or videos", async () => {
    await testDb.delete(schema.setlistItems);
    await testDb.delete(schema.concertVideos);
    const { proposal } = await runConcertRefresh("concert", vi.fn());
    expect((await getConcertRefreshSnapshot("concert")).sets[0].songs).toEqual([]);
    expect(proposal.findings.videos).toHaveLength(2);
    await applyConcertRefresh(proposal);
    expect((await getConcertRefreshSnapshot("concert")).sets[0].songs).toEqual(["New song", "Existing song", "New song"]);
  });

  it("searches future concerts without writing anything, then applies exactly the preview on approval", async () => {
    const before = await getConcertRefreshSnapshot("concert");
    const { proposal } = await runConcertRefresh("concert", vi.fn());
    expect(await getConcertRefreshSnapshot("concert")).toEqual(before);
    expect(proposal.findings.setlists[0].songs).toEqual(["New song", "Existing song", "New song"]);
    expect(findSongVideo).toHaveBeenCalledTimes(1); // repeated songs share a video; uploaded videos survive
    expect(findSongVideo).toHaveBeenCalledWith(expect.objectContaining({ song: "New song", sort: "2026-12-01", city: "Berlin" }));

    await applyConcertRefresh(proposal);
    const saved = await getConcertRefreshSnapshot("concert");
    expect(saved.sets[0].songs).toEqual(proposal.findings.setlists[0].songs);
    expect(saved.sets[0].setlistFmUrl).toBe(setlistFmUrl);
    expect(saved.sets[0].videos).toEqual({ "Existing song": "/videos/uploads/mine.mp4", "New song": "https://www.youtube.com/watch?v=new" });
    expect(saved.reviews).toEqual(proposal.findings.reviews);
    expect(saved.recordings).toEqual(proposal.findings.recordings);
    expect(requireUser).toHaveBeenCalled();
  });

  it("shows no changes for repeated identical results and does not duplicate reviews or recordings", async () => {
    await applyConcertRefresh((await runConcertRefresh("concert", vi.fn())).proposal);
    const { proposal } = await runConcertRefresh("concert", vi.fn());
    expect(hasConcertRefreshChanges(concertRefreshChanges(proposal))).toBe(false);
    const before = await getConcertRefreshSnapshot("concert");
    await applyConcertRefresh(proposal);
    expect(await getConcertRefreshSnapshot("concert")).toEqual(before);
  });

  it("preserves stored data on empty search results", async () => {
    vi.mocked(fetchSetlistFromSetlistFm).mockResolvedValue({ songs: [], setlistFmUrl: null });
    vi.mocked(findConcertReviews).mockResolvedValue([]);
    vi.mocked(findConcertRecording).mockResolvedValue(null);
    const before = await getConcertRefreshSnapshot("concert");
    const { proposal } = await runConcertRefresh("concert", vi.fn());
    expect(hasConcertRefreshChanges(concertRefreshChanges(proposal))).toBe(false);
    await applyConcertRefresh(proposal);
    expect(await getConcertRefreshSnapshot("concert")).toEqual(before);
  });

  it("updates a newly found source link without clearing an existing setlist", async () => {
    vi.mocked(fetchSetlistFromSetlistFm).mockResolvedValue({ songs: [], setlistFmUrl });
    const { proposal } = await runConcertRefresh("concert", vi.fn());
    expect(concertRefreshChanges(proposal).setlists).toHaveLength(1);
    await applyConcertRefresh(proposal);
    const saved = await getConcertRefreshSnapshot("concert");
    expect(saved.sets[0].songs).toEqual(["Existing song"]);
    expect(saved.sets[0].setlistFmUrl).toBe(setlistFmUrl);
  });

  it("keeps a useful partial preview if one source fails", async () => {
    vi.mocked(fetchSetlistFromSetlistFm).mockRejectedValue(new Error("Source unavailable"));
    const { proposal, warnings } = await runConcertRefresh("concert", vi.fn());
    expect(warnings).toEqual(["Setlist (Test Artist): Source unavailable"]);
    expect(proposal.findings.recordings).toHaveLength(1);
    expect(proposal.findings.reviews).toHaveLength(1);
    await applyConcertRefresh(proposal);
    expect((await getConcertRefreshSnapshot("concert")).sets[0].songs).toEqual(["Existing song"]);
  });

  it("stops the read-only search when dismissed", async () => {
    const abort = new AbortController();
    vi.mocked(fetchSetlistFromSetlistFm).mockImplementation(async () => {
      abort.abort();
      return { songs: [], setlistFmUrl: null };
    });
    const before = await getConcertRefreshSnapshot("concert");
    await expect(runConcertRefresh("concert", vi.fn(), abort.signal)).rejects.toThrow();
    expect(findConcertReviews).not.toHaveBeenCalled();
    expect(findSongVideo).not.toHaveBeenCalled();
    expect(await getConcertRefreshSnapshot("concert")).toEqual(before);
  });

  it("rejects a stale preview instead of overwriting a concurrent edit", async () => {
    const { proposal } = await runConcertRefresh("concert", vi.fn());
    await testDb.update(schema.concerts).set({ venue: "Changed venue" }).where(eq(schema.concerts.id, "concert"));
    await expect(applyConcertRefresh(proposal)).rejects.toThrow("inzwischen geändert");
    expect((await getConcertRefreshSnapshot("concert")).sets[0].songs).toEqual(["Existing song"]);
  });

  it("rolls back every change if a later candidate is invalid", async () => {
    const { proposal } = await runConcertRefresh("concert", vi.fn());
    proposal.findings.recordings[0].url = "javascript:alert(1)";
    const before = await getConcertRefreshSnapshot("concert");
    await expect(applyConcertRefresh(proposal)).rejects.toThrow("Ungültiger Link");
    expect(await getConcertRefreshSnapshot("concert")).toEqual(before);
  });

  it("refreshes festival acts separately and keeps their videos with the correct act", async () => {
    await testDb.update(schema.concerts).set({ eventKind: "multi_act", eventTitle: "Festival" }).where(eq(schema.concerts.id, "concert"));
    for (const [index, name] of ["First Act", "Second Act"].entries()) {
      await testDb.insert(schema.concertActs).values({ id: `act-${index}`, concertId: "concert", position: index, artistSlug: `act-${index}`, artistName: name, setlistJson: "[]" });
    }
    const { proposal } = await runConcertRefresh("concert", vi.fn());
    expect(fetchSetlistFromSetlistFm).toHaveBeenCalledWith(expect.objectContaining({ artistName: "First Act" }));
    expect(fetchSetlistFromSetlistFm).toHaveBeenCalledWith(expect.objectContaining({ artistName: "Second Act" }));
    await applyConcertRefresh(proposal);
    const saved = await getConcertRefreshSnapshot("concert");
    expect(saved.sets).toHaveLength(2);
    for (const set of saved.sets) {
      expect(set.songs).toEqual(["New song", "Existing song", "New song"]);
      expect(set.videos).toEqual({ "New song": "https://www.youtube.com/watch?v=new", "Existing song": "https://www.youtube.com/watch?v=new" });
    }
    // Refreshing festival acts must not replace an unrelated flat setlist.
    expect(await testDb.select().from(schema.setlistItems)).toEqual([{ concertId: "concert", position: 1, songTitle: "Existing song" }]);
  });
});

describe("refresh change detection", () => {
  it("recognizes song order changes even when the song count is unchanged", () => {
    const proposal: ConcertRefreshProposal = {
      snapshot: { concertId: "c", identity: "", sets: [{ actId: null, artistName: "Artist", songs: ["One", "Two"], setlistFmUrl, videos: {} }], reviews: [], recordings: [] },
      findings: { setlists: [{ actId: null, songs: ["Two", "One"], setlistFmUrl }], videos: [], reviews: [], recordings: [] },
    };
    expect(concertRefreshChanges(proposal).setlists).toHaveLength(1);
  });
});
