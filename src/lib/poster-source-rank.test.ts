import { describe, expect, it } from "vitest";
import { posterSourceRank, shouldApplyPosterOverride } from "./poster-source-rank";

describe("posterSourceRank", () => {
  it("ranks Turso API uploads highest", () => {
    expect(posterSourceRank("/api/posters/abc.jpg")).toBeGreaterThan(
      posterSourceRank("/posters/uploads/abc.jpg"),
    );
    expect(posterSourceRank("/posters/uploads/abc.jpg")).toBeGreaterThan(
      posterSourceRank("/posters/placebo--tour.jpg"),
    );
  });
});

describe("shouldApplyPosterOverride", () => {
  it("never replaces a live /api/posters/ path with a different path unless forced", () => {
    expect(
      shouldApplyPosterOverride(
        "/api/posters/new-upload.jpg",
        "/posters/placebo--album.jpg",
      ),
    ).toBe(false);
    expect(
      shouldApplyPosterOverride(
        "/api/posters/new-upload.jpg",
        "/api/posters/old-missing.jpg",
      ),
    ).toBe(false);
    expect(
      shouldApplyPosterOverride(
        "/api/posters/new-upload.jpg",
        "/api/posters/old-missing.jpg",
        true,
      ),
    ).toBe(true);
  });

  it("allows same-path label/crop updates and upgrading catalog posters", () => {
    expect(
      shouldApplyPosterOverride("/api/posters/same.jpg", "/api/posters/same.jpg"),
    ).toBe(true);
    expect(
      shouldApplyPosterOverride("/posters/album.jpg", "/api/posters/live.jpg"),
    ).toBe(true);
  });
});
