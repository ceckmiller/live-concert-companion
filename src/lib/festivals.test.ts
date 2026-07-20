import { describe, expect, it } from "vitest";
import {
  FESTIVAL_CONCERT_IDS,
  isChronologyConcert,
  isFestivalArtist,
  isFestivalConcert,
  isFestivalSectionConcert,
  isFestivalSlotConcert,
  shouldIncludeFestivalAct,
} from "./festivals";

describe("festivals", () => {
  it("marks festival pseudo-artists", () => {
    expect(isFestivalArtist("madstock")).toBe(true);
    expect(isFestivalArtist("morrissey")).toBe(false);
    expect(isFestivalArtist("seeed")).toBe(false);
  });

  it("separates chronology, festival section, and mirrored slots", () => {
    expect(isFestivalConcert("madstock-1992-08-08")).toBe(true);
    expect(isFestivalSlotConcert("bilderbuch-2017-06-18")).toBe(true);
    expect(isChronologyConcert({ id: "placebo-2022-10-06" })).toBe(true);
    expect(isChronologyConcert({ id: "madstock-1992-08-08" })).toBe(false);
    expect(isChronologyConcert({ id: "bilderbuch-2017-06-18" })).toBe(false);
    expect(isFestivalSectionConcert({ id: "madstock-1992-08-08" })).toBe(true);
    expect(isFestivalSectionConcert({ id: "bilderbuch-2017-06-18" })).toBe(false);
  });

  it("includes Morrissey Madstock act but skips duplicate Bilderbuch PxP slot", () => {
    expect(
      shouldIncludeFestivalAct("morrissey", "madstock-1992-08-08", "1992-08-08", []),
    ).toBe(true);
    expect(
      shouldIncludeFestivalAct("bilderbuch", "peace-by-peace-2017-06-18", "2017-06-18", [
        { id: "bilderbuch-2017-06-18", sort: "2017-06-18" },
      ]),
    ).toBe(false);
  });

  it("lists all requested festival events", () => {
    for (const id of [
      "peace-by-peace-2016-06-05",
      "peace-by-peace-2017-06-18",
      "madstock-1992-08-08",
      "seeed-2014-08-22",
      "konzert-fuer-berlin-1989-11-12",
      "heino-aid-1986-10-18",
    ]) {
      expect(FESTIVAL_CONCERT_IDS.has(id)).toBe(true);
    }
  });
});
