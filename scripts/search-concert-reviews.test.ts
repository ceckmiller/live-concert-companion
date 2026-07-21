import { describe, expect, it } from "vitest";
import {
  reviewSearchQueries,
  scoreReviewHit,
  sourceFromUrl,
} from "./search-concert-reviews.mjs";

describe("search-concert-reviews", () => {
  it("builds German review search queries", () => {
    const queries = reviewSearchQueries({
      artistName: "Placebo",
      city: "Berlin",
      venue: "Uber Arena",
      sort: "2022-10-06",
    });
    expect(queries[0]).toContain("Placebo");
    expect(queries[0]).toContain("Kritik");
    expect(queries.some((q) => q.includes("2022"))).toBe(true);
  });

  it("scores press review hosts higher than ticket sites", () => {
    const task = {
      artistName: "Placebo",
      city: "Berlin",
      sort: "2022-10-06",
    };
    const review = scoreReviewHit(
      {
        title: "Placebo in Berlin — Konzertkritik",
        url: "https://www.laut.de/News/Placebo-Berlin-2022",
      },
      task,
    );
    const ticket = scoreReviewHit(
      {
        title: "Placebo Berlin Tickets",
        url: "https://www.eventim.de/placebo",
      },
      task,
    );
    expect(review).toBeGreaterThan(ticket);
    expect(review).toBeGreaterThanOrEqual(40);
  });

  it("extracts hostname as source", () => {
    expect(sourceFromUrl("https://www.laut.de/foo")).toBe("laut.de");
  });
});
