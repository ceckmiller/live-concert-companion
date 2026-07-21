import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import {
  findArtistById,
  findArtistBySlug,
  findConcertById,
  findConcertBySlug,
  findConcertBySlugs,
  recordSlugAlias,
} from "./concert-lookup";

describe("findConcertBySlugs", () => {
  it("falls back to the owning artist when the UI passes a guest act slug", async () => {
    const db = getDb();
    const result = await findConcertBySlugs(db, "morrissey", "madstock-1992-08-08");
    expect(result.artist.slug).toBe("madstock");
    expect(result.concert.slug).toBe("madstock-1992-08-08");
  });

  it("finds concerts under the requested artist slug", async () => {
    const db = getDb();
    const result = await findConcertBySlugs(db, "placebo", "placebo-2022-10-06");
    expect(result.artist.slug).toBe("placebo");
    expect(result.concert.slug).toBe("placebo-2022-10-06");
  });

  it("finds concerts by slug alone when the artist slug in the UI is stale", async () => {
    const db = getDb();
    const result = await findConcertBySlugs(db, "heino-aid", "madstock-1992-08-08");
    expect(result.artist.slug).toBe("madstock");
    expect(result.concert.slug).toBe("madstock-1992-08-08");
  });
});

describe("stable id lookups", () => {
  it("finds artist and concert by UUID", async () => {
    const db = getDb();
    const bySlug = await findConcertBySlug(db, "placebo-2022-10-06");
    const byId = await findConcertById(db, bySlug.concert.id);
    expect(byId.concert.id).toBe(bySlug.concert.id);
    expect(byId.concert.slug).toBe("placebo-2022-10-06");

    const artistById = await findArtistById(db, bySlug.artist.id);
    expect(artistById.slug).toBe("placebo");
  });

  it("resolves concerts via slug_aliases", async () => {
    const db = getDb();
    const { concert } = await findConcertBySlug(db, "madstock-1992-08-08");
    const alias = `alias-test-${concert.id.slice(0, 8)}`;
    await recordSlugAlias(db, "concert", concert.id, alias);
    const viaAlias = await findConcertBySlug(db, alias);
    expect(viaAlias.concert.id).toBe(concert.id);
  });

  it("resolves artists via slug_aliases", async () => {
    const db = getDb();
    const artist = await findArtistBySlug(db, "placebo");
    const alias = `artist-alias-${artist.id.slice(0, 8)}`;
    await recordSlugAlias(db, "artist", artist.id, alias);
    const viaAlias = await findArtistBySlug(db, alias);
    expect(viaAlias.id).toBe(artist.id);
  });
});
