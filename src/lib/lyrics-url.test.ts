import { describe, expect, it } from "vitest";
import { buildLyricsUrl, lyricsSearchQuery } from "./lyrics-url";

describe("buildLyricsUrl", () => {
  it("routes through the lyrics redirect API", () => {
    const url = buildLyricsUrl("Easy", { origin: "artist", album: "Raop", year: 2012 }, "CRO");
    expect(url).toBe("/api/lyrics?q=CRO+Easy");
  });

  it("uses cover artist and strips (cover) suffix in search query", () => {
    expect(
      lyricsSearchQuery(
        "A Hard Day's Night (cover)",
        { origin: "cover", by: "The Beatles", album: "A Hard Day's Night", year: 1964 },
        "Wanda",
      ),
    ).toBe("The Beatles A Hard Day's Night");
  });
});
