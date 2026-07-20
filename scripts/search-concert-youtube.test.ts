import { describe, expect, it } from "vitest";
import { concertBlocks, listSongSearchTasks } from "./search-concert-youtube.mjs";

describe("search-concert-youtube", () => {
  it("includes partial festival act setlists for video search", () => {
    const pxp = { id: "peace-by-peace-2017-06-18", artistName: "Peace x Peace", sort: "2017-06-18", city: "Berlin" };
    const blocks = concertBlocks(pxp);
    const freundeskreis = blocks.find((b) => b.artistName === "Freundeskreis");
    expect(freundeskreis?.setlist).toContain("Esperanto");
  });

  it("lists Morrissey and other concerts in one task list", () => {
    const tasks = listSongSearchTasks();
    expect(tasks.some((t) => t.store === "morrissey")).toBe(true);
    expect(tasks.some((t) => t.concertId === "morrissey-1992-08-08")).toBe(false);
    expect(tasks.some((t) => t.concertId === "bilderbuch-2022-04-11")).toBe(true);
    expect(tasks.length).toBeGreaterThan(1000);
  });
});
