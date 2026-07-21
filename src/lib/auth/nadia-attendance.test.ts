import { describe, expect, it } from "vitest";
import {
  NADIA_ALL_CONCERT_ARTIST_SLUGS,
  NADIA_MORRISSEY_CONCERT_SLUGS,
} from "./nadia-attendance";

describe("nadia attendance policy", () => {
  it("includes shared artists and only three Morrissey shows", () => {
    expect(NADIA_ALL_CONCERT_ARTIST_SLUGS).toContain("die-fantastischen-vier");
    expect(NADIA_ALL_CONCERT_ARTIST_SLUGS).toContain("depeche-mode");
    expect(NADIA_ALL_CONCERT_ARTIST_SLUGS).toContain("loyle-carner");
    expect(NADIA_ALL_CONCERT_ARTIST_SLUGS).toContain("peace-by-peace");
    expect(NADIA_ALL_CONCERT_ARTIST_SLUGS).not.toContain("morrissey");
    expect(NADIA_MORRISSEY_CONCERT_SLUGS).toEqual([
      "berlin-2026",
      "rah-2018",
      "ally-pally-2018",
    ]);
  });
});
