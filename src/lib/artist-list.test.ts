import { describe, expect, it } from "vitest";
import {
  countArtistVisibleConcerts,
  filterFestivalGuestArtists,
  filterSoloConcertArtists,
} from "./artist-list";

describe("artist list policy", () => {
  it("hides act-only artists with zero headliner concerts", () => {
    const rows = [
      {
        id: "1",
        slug: "die-toten-hosen",
        name: "Die Toten Hosen",
        image_path: null,
        concert_count: 1,
        headlinerConcerts: [{ id: "a", slug: "die-toten-hosen-1987-09-05", sort: "1987-09-05" }],
      },
      {
        id: "2",
        slug: "stunde-x",
        name: "Stunde X",
        image_path: null,
        concert_count: 0,
        headlinerConcerts: [],
      },
      {
        id: "3",
        slug: "wanda",
        name: "Wanda",
        image_path: null,
        concert_count: 2,
        headlinerConcerts: [
          { id: "b", slug: "wanda-2016-03-01", sort: "2016-03-01" },
          { id: "c", slug: "wanda-2015-12-05", sort: "2015-12-05" },
        ],
      },
    ];
    expect(filterSoloConcertArtists(rows).map((r) => r.slug)).toEqual(["die-toten-hosen", "wanda"]);
  });

  it("excludes festival pseudo-artists from solo artist list", () => {
    const rows = [
      {
        id: "1",
        slug: "morrissey",
        name: "Morrissey",
        image_path: null,
        concert_count: 10,
        headlinerConcerts: [{ id: "a", slug: "berlin-2026", sort: "2026-07-07" }],
      },
      {
        id: "2",
        slug: "madstock",
        name: "Madstock",
        image_path: null,
        concert_count: 1,
        headlinerConcerts: [
          { id: "b", slug: "madstock-1992-08-08", sort: "1992-08-08", eventKind: "multi_act" },
        ],
      },
    ];
    expect(filterSoloConcertArtists(rows).map((r) => r.slug)).toEqual(["morrissey"]);
  });

  it("lists festival-only guest artists separately", () => {
    const rows = [
      {
        id: "1",
        slug: "morrissey",
        name: "Morrissey",
        image_path: null,
        concert_count: 15,
        headlinerConcerts: [{ id: "a", slug: "berlin-2026", sort: "2026-07-07" }],
      },
      {
        id: "2",
        slug: "stunde-x",
        name: "Stunde X",
        image_path: null,
        concert_count: 1,
        headlinerConcerts: [],
      },
    ];
    expect(filterFestivalGuestArtists(rows).map((r) => r.slug)).toEqual(["stunde-x"]);
    expect(filterSoloConcertArtists(rows).map((r) => r.slug)).toEqual(["morrissey"]);
  });

  it("counts festival guest appearances like the artist detail page", () => {
    const morrisseyHeadliners = Array.from({ length: 14 }, (_, i) => ({
      id: `id-${i}`,
      slug: `morrissey-${i}`,
      sort: `202${i % 10}-01-01`,
    }));
    expect(
      countArtistVisibleConcerts("morrissey", morrisseyHeadliners, [
        { parentSlug: "madstock-1992-08-08", sortDate: "1992-08-08" },
      ]),
    ).toBe(15);

    expect(
      countArtistVisibleConcerts(
        "seeed",
        [
          { id: "1", slug: "seeed-2022-08-13", sort: "2022-08-13" },
          { id: "2", slug: "seeed-other", sort: "2016-01-01" },
        ],
        [{ parentSlug: "peace-by-peace-2016-06-05", sortDate: "2016-06-05" }],
      ),
    ).toBe(3);
  });
});
