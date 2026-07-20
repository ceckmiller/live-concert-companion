import { describe, expect, it } from "vitest";
import {
  festivalAliasesForConcert,
  textMatchesConcertDate,
  textMatchesSongLiveVideo,
} from "./concert-live-video-date.mjs";

describe("concert live video date matching", () => {
  it("accepts explicit concert dates in metadata", () => {
    expect(textMatchesConcertDate("Morrissey - May 5, 1991 - Berlin, Germany", "1991-05-05")).toBe(true);
    expect(textMatchesConcertDate("Live in Berlin 5.5.1991", "1991-05-05")).toBe(true);
  });

  it("rejects wrong-year footage for a dated concert", () => {
    expect(textMatchesConcertDate("Morrissey - November Spawned a Monster (live 1992 Germany)", "1991-05-05")).toBe(
      false,
    );
  });

  it("accepts Madstock-tagged festival footage for Madstock 1992", () => {
    const aliases = festivalAliasesForConcert("madstock-1992-08-08");
    expect(
      textMatchesSongLiveVideo("Morrissey - 08 Suedehead (Madstock)", "Suedehead", "1992-08-08", {
        festivalAliases: aliases,
      }),
    ).toBe(true);
    expect(
      textMatchesConcertDate("Madness - Our House (Live at Madstock 1992)", "1992-08-08", {
        festivalAliases: aliases,
      }),
    ).toBe(true);
  });

  it("rejects full-show links without the song title for per-song slots", () => {
    expect(
      textMatchesSongLiveVideo("Morrissey - May 5, 1991 - Berlin, Germany", "Interesting Drug", "1991-05-05", {
        city: "Berlin",
        venue: "Metropol",
      }),
    ).toBe(false);
  });

  it("requires concert city or venue for non-festival live clips", () => {
    expect(
      textMatchesSongLiveVideo(
        "Red Hot Chili Peppers - Under the Bridge live 1992 Paris",
        "Under the Bridge",
        "1992-03-22",
        { city: "Berlin", venue: "Die Halle" },
      ),
    ).toBe(false);
    expect(
      textMatchesSongLiveVideo(
        "Red Hot Chili Peppers - Under the Bridge live Berlin 22.3.1992",
        "Under the Bridge",
        "1992-03-22",
        { city: "Berlin", venue: "Die Halle" },
      ),
    ).toBe(true);
  });
});
