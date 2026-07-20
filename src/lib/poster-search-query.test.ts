import { describe, expect, it } from "vitest";
import { defaultPosterSearchQuery } from "./poster-search-query";

describe("defaultPosterSearchQuery", () => {
  it("builds editable default search terms from concert metadata", () => {
    expect(defaultPosterSearchQuery("Peter Fox", "LIVE 2023", "Berlin", "2023")).toBe(
      "Peter Fox LIVE 2023 Berlin Tourplakat",
    );
  });

  it("falls back to artist name when tour is empty", () => {
    expect(defaultPosterSearchQuery("Placebo", "", "Berlin", "2024")).toBe(
      "Placebo Placebo Berlin 2024 Tourplakat",
    );
  });
});
