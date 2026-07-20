import { describe, expect, it } from "vitest";
import { setlistEntryKey } from "./setlist-keys";

describe("setlistEntryKey", () => {
  it("keeps duplicate song titles unique per position", () => {
    const song = "Haus am See";
    expect(setlistEntryKey(18, song)).not.toBe(setlistEntryKey(22, song));
  });
});
