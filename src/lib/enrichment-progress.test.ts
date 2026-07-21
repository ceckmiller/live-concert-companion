import { describe, expect, it } from "vitest";
import {
  initialEnrichmentSteps,
  initialRefreshEnrichmentSteps,
  setStepStatus,
} from "./enrichment-progress";

describe("enrichment-progress", () => {
  it("builds create steps with reviews and optional poster skip", () => {
    const full = initialEnrichmentSteps();
    expect(full.map((s) => s.id)).toEqual([
      "save",
      "setlist",
      "poster",
      "videos",
      "reviews",
      "recordings",
      "done",
    ]);
    const skipPoster = initialEnrichmentSteps(true);
    expect(skipPoster.map((s) => s.id)).not.toContain("poster");
    expect(skipPoster.map((s) => s.id)).toContain("reviews");
  });

  it("builds refresh steps without save/poster", () => {
    expect(initialRefreshEnrichmentSteps().map((s) => s.id)).toEqual([
      "setlist",
      "videos",
      "reviews",
      "recordings",
      "done",
    ]);
  });

  it("updates a single step status", () => {
    const next = setStepStatus(initialRefreshEnrichmentSteps(), "setlist", "done", "12 Songs");
    expect(next.find((s) => s.id === "setlist")).toMatchObject({
      status: "done",
      detail: "12 Songs",
    });
  });
});
