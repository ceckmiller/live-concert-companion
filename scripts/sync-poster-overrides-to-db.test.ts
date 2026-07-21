import { describe, expect, it } from "vitest";
import { SLUG_ALIASES } from "./sync-poster-overrides-to-db";
import { shouldApplyPosterOverride } from "../src/lib/poster-source-rank";

describe("sync poster overrides slug aliases", () => {
  it("maps legacy Heino Aid override key to current festival slug", () => {
    expect(SLUG_ALIASES["heino-aid-1986-10-18"]).toBe(
      "benefizkonzert-fur-den-wahren-heino-1986-10-18",
    );
  });

  it("protects live Turso poster uploads from stale JSON sync", () => {
    expect(
      shouldApplyPosterOverride(
        "/api/posters/live-upload.jpg",
        "https://cdn.example.com/old-placeholder.jpeg",
      ),
    ).toBe(false);
  });
});
