import { describe, expect, it } from "vitest";
import { OTHER_CONCERTS } from "../../scripts/live-konzert-companion-concerts.mjs";

describe("catalog exclusions", () => {
  it("no longer seeds Peace x Peace 2016 after user deletion", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "peace-by-peace-2016-06-05")).toBe(false);
    expect(OTHER_CONCERTS.some((c) => c.id === "peace-by-peace-2017-06-18")).toBe(true);
  });
});
