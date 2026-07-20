import { describe, expect, it } from "vitest";
import { concertSlug, catalogConcertSlug, formatGermanDate, slugify } from "@/lib/slug";

describe("companion slug helpers", () => {
  it("slugifies artist names", () => {
    expect(slugify("Die Fantastischen Vier")).toBe("die-fantastischen-vier");
    expect(slugify("Voodoo Jürgens")).toBe("voodoo-jurgens");
  });

  it("formats german dates", () => {
    expect(formatGermanDate("2026-07-07")).toBe("7. Juli 2026");
  });

  it("builds concert slugs", () => {
    expect(concertSlug("Berlin", "2022-10-06")).toBe("berlin-2022-10-06");
    expect(catalogConcertSlug("Peter Fox", "2023-08-22")).toBe("peter-fox-2023-08-22");
  });
});
