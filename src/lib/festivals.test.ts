import { describe, expect, it } from "vitest";
import {
  FESTIVAL_CONCERT_IDS,
  isChronologyConcert,
  isFestivalArtist,
  isMultiActConcert,
  isFestivalSlotConcert,
  isTimelineConcert,
  shouldIncludeFestivalAct,
} from "./festivals";

describe("festivals", () => {
  it("marks festival pseudo-artists", () => {
    expect(isFestivalArtist("madstock")).toBe(true);
    expect(isFestivalArtist("ferropolis-open-air")).toBe(true);
    expect(isFestivalArtist("morrissey")).toBe(false);
    expect(isFestivalArtist("seeed")).toBe(false);
  });

  it("separates timeline, multi-act, and mirrored slots", () => {
    expect(isMultiActConcert({ id: "x", slug: "madstock-1992-08-08" })).toBe(true);
    expect(isFestivalSlotConcert({ id: "x", slug: "bilderbuch-2017-06-18" })).toBe(true);
    expect(isChronologyConcert({ id: "x", slug: "placebo-2022-10-06" })).toBe(true);
    expect(isChronologyConcert({ id: "x", slug: "madstock-1992-08-08" })).toBe(false);
    expect(isTimelineConcert({ id: "x", slug: "madstock-1992-08-08" })).toBe(true);
    expect(isTimelineConcert({ id: "x", slug: "placebo-2022-10-06" })).toBe(true);
    expect(isTimelineConcert({ id: "x", slug: "bilderbuch-2017-06-18" })).toBe(false);
  });

  it("prefers eventKind from the database over legacy ids", () => {
    expect(isMultiActConcert({ id: "uuid", slug: "placebo-2022-10-06", eventKind: "multi_act" })).toBe(
      true,
    );
    expect(isTimelineConcert({ id: "uuid", slug: "madstock-1992-08-08", eventKind: "solo" })).toBe(
      true,
    );
    expect(isMultiActConcert({ id: "uuid", eventKind: "festival" })).toBe(true);
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
      "benefizkonzert-fur-den-wahren-heino-1986-10-18",
      "heino-aid-1986-10-18",
    ]) {
      expect(FESTIVAL_CONCERT_IDS.has(id)).toBe(true);
    }
  });

  it("treats Benefizkonzert für den wahren Heino as multi-act in the timeline", () => {
    expect(isFestivalArtist("benefizkonzert-fur-den-wahren-heino")).toBe(true);
    expect(
      isMultiActConcert({ id: "x", slug: "benefizkonzert-fur-den-wahren-heino-1986-10-18" }),
    ).toBe(true);
    expect(
      isChronologyConcert({ id: "x", slug: "benefizkonzert-fur-den-wahren-heino-1986-10-18" }),
    ).toBe(false);
    expect(
      isTimelineConcert({ id: "x", slug: "benefizkonzert-fur-den-wahren-heino-1986-10-18" }),
    ).toBe(true);
  });
});
