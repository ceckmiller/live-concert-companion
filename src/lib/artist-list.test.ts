import { describe, expect, it } from "vitest";
import { filterHeadlinerArtists } from "./artist-list";

describe("artist list policy", () => {
  it("hides act-only artists with zero headliner concerts", () => {
    const rows = [
      { slug: "die-toten-hosen", concert_count: 1 },
      { slug: "stunde-x", concert_count: 0 },
      { slug: "wanda", concert_count: 2 },
    ];
    expect(filterHeadlinerArtists(rows).map((r) => r.slug)).toEqual(["die-toten-hosen", "wanda"]);
  });
});
