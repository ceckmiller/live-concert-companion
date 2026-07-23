import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({
  enrichConcertSetlist: vi.fn(async () => ({
    songsFound: 0,
    setlistFmUrl: null,
    songs: [],
  })),
  enrichConcertPoster: vi.fn(async () => {
    throw new Error("poster boom");
  }),
  listConcertSongsMissingVideos: vi.fn(async () => ({ songs: [], missing: [] })),
  enrichConcertVideoSong: vi.fn(),
  enrichConcertReviews: vi.fn(async () => ({ reviewsFound: 0, added: 0 })),
  enrichConcertRecordings: vi.fn(async () => ({ recordingsFound: 0, added: 0 })),
}));

import { runConcertInternetEnrichment } from "./run-concert-enrichment";

describe("runConcertInternetEnrichment", () => {
  it("does not throw when setlist is missing or a later step fails", async () => {
    const events: { id: string; status: string; detail?: string }[] = [];
    await expect(
      runConcertInternetEnrichment(
        { artistSlug: "simply-red", concertSlug: "simply-red-1998-01-30" },
        {
          includePoster: true,
          patchStep: (id, status, detail) => {
            events.push({ id, status, detail });
          },
        },
      ),
    ).resolves.toBeUndefined();

    expect(events.find((e) => e.id === "setlist" && e.status === "skipped")).toBeTruthy();
    expect(events.find((e) => e.id === "poster" && e.status === "skipped")).toBeTruthy();
    expect(events.find((e) => e.id === "done" && e.status === "done")).toBeTruthy();
  });
});
