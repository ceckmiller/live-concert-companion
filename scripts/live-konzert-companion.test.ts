import { describe, expect, it } from "vitest";
import { ARTISTS, OTHER_CONCERTS } from "./live-konzert-companion-concerts.mjs";

describe("live konzert companion data", () => {
  it("has unique concert ids", () => {
    const ids = OTHER_CONCERTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires sort date and artist for every concert", () => {
    for (const c of OTHER_CONCERTS) {
      expect(c.sort, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.artistId, c.id).toBeTruthy();
      expect(c.artistName, c.id).toBeTruthy();
      expect(c.title, c.id).toBeTruthy();
      expect(c.time, c.id).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("lists morrissey as featured artist", () => {
    const morrissey = ARTISTS.find((a) => a.id === "morrissey");
    expect(morrissey?.featured).toBe(true);
  });

  it("covers every other concert artist in ARTISTS", () => {
    const artistIds = new Set(ARTISTS.map((a) => a.id));
    const missing = [...new Set(OTHER_CONCERTS.map((c) => c.artistId))].filter((id) => !artistIds.has(id));
    expect(missing).toEqual([]);
  });
});
