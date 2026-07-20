import { describe, expect, it } from "vitest";
import {
  artistMatchesResult,
  buildConcertPosterQueries,
  buildDefaultConcertPosterQuery,
  buildTourPosterQueries,
  buildTourPosterQuery,
  posterYearMatches,
  rankPosterResults,
  scorePosterResult,
  tourQueryParts,
  yearMatchScore,
} from "./tour-poster-search.mjs";

describe("tour poster search", () => {
  it("builds a query from artist, tour title and year", () => {
    expect(buildTourPosterQuery("Johnny Marr", "Spirit Power Tour", "2025")).toBe(
      "Johnny Marr Spirit Power Tour 2025 tour poster",
    );
  });

  it("does not duplicate the year when the tour title already contains it", () => {
    expect(tourQueryParts("LIVE 2023", "2023")).toEqual({ tour: "LIVE 2023", yearStr: "" });
    expect(buildTourPosterQuery("Peter Fox", "LIVE 2023", "2023")).toBe("Peter Fox LIVE 2023 tour poster");
  });

  it("builds German and English query variants", () => {
    const queries = buildTourPosterQueries("Robbie Williams", "Close Encounters World Tour", "2006");
    expect(queries.some((q) => q.includes("Tourplakat"))).toBe(true);
    expect(queries.every((q) => q.includes("2006"))).toBe(true);
    expect(queries.some((q) => q.includes("2006 2006"))).toBe(false);
  });

  it("builds concert poster queries with artist, tour, city and year", () => {
    const queries = buildConcertPosterQueries("Peter Fox", "LIVE 2023", "2023", "Berlin");
    expect(queries[0]).toContain("Peter Fox");
    expect(queries[0]).toContain("Berlin");
    expect(queries.some((q) => q.includes("Tourplakat"))).toBe(true);
    expect(buildDefaultConcertPosterQuery("Peter Fox", "LIVE 2023", "2023", "Berlin")).toBe(queries[0]);
  });

  it("requires all artist tokens, not just the first name", () => {
    expect(artistMatchesResult("Peter Fox", "Peter Gabriel i/o The Tour 2023 Poster")).toBe(false);
    expect(artistMatchesResult("Peter Fox", "Peter Fox LIVE 2023 Tourplakat")).toBe(true);
    expect(artistMatchesResult("The Toy Dolls", "1989 Mattel Turtle Tots Trio")).toBe(false);
    expect(artistMatchesResult("The Toy Dolls", "The Toy Dolls Ten Tiny Tots Tour Poster")).toBe(true);
  });

  it("prefers explicit tour poster results over album art", () => {
    const poster = scorePosterResult(
      {
        title: "JOHNNY MARR The Spirit Power 2025 UK Summer Tour Poster",
        image: "https://www.prints4u.net/wp-content/uploads/2025/05/Johnny-Marr-004.jpg",
        width: 1054,
        height: 1500,
      },
      "Johnny Marr",
      "Spirit Power Tour",
      "2025",
    );
    const album = scorePosterResult(
      {
        title: "Spirit Power and Soul",
        image: "https://upload.wikimedia.org/wikipedia/en/4/4e/Johnny_Marr_-_Spirit_Power_and_Soul.jpg",
        width: 440,
        height: 440,
      },
      "Johnny Marr",
      "Spirit Power Tour",
      "2025",
    );
    expect(poster).toBeGreaterThan(album);
    expect(poster).toBeGreaterThanOrEqual(20);
  });

  it("heavily penalizes wrong tour years and foreign artists", () => {
    const wrongArtist = scorePosterResult(
      {
        title: "Peter Gabriel i/o The Tour 2023 Poster Set",
        image: "https://cdn.printerval.com/image/peter-gabriel-2023-poster.jpg",
        width: 900,
        height: 1200,
      },
      "Peter Fox",
      "LIVE 2023",
      "2023",
    );
    const rightArtist = scorePosterResult(
      {
        title: "Peter Fox LIVE 2023 Tour Poster Waldbühne",
        image: "https://example.com/peter-fox-live-2023-poster.jpg",
        width: 900,
        height: 1200,
      },
      "Peter Fox",
      "LIVE 2023",
      "2023",
    );
    expect(yearMatchScore("Robbie Williams Close Encounters World Tour 2006 Poster", "2006")).toBeGreaterThan(0);
    expect(yearMatchScore("Robbie Williams XXV Tour Poster 2023", "2006")).toBeLessThan(0);
    expect(wrongArtist).toBeLessThan(0);
    expect(rightArtist).toBeGreaterThan(wrongArtist);
    expect(posterYearMatches("Robbie Williams Close Encounters World Tour 2006 Poster", "2006")).toBe(true);
    expect(posterYearMatches("Robbie Williams XXV Tour Poster 2023", "2006")).toBe(false);
  });

  it("filters ranked results to matching artist and year", () => {
    const ranked = rankPosterResults(
      [
        {
          title: "Jacob Collier 2024 Tour Poster",
          image: "https://shop.jacobcollier.com/poster.png",
          width: 1000,
          height: 1400,
        },
        {
          title: "Peter Fox LIVE 2023 Tour Poster Berlin",
          image: "https://example.com/peter-fox-live-2023.jpg",
          width: 900,
          height: 1200,
        },
      ],
      "Peter Fox",
      "LIVE 2023",
      "2023",
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].title).toContain("Peter Fox");
  });
});
