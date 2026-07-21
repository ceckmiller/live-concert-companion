import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("./auth/session", () => ({
  requireUser: vi.fn(async () => ({
    id: "test-admin",
    email: "admin@localhost",
    name: "Admin",
    role: "admin",
  })),
  requireAdmin: vi.fn(async () => ({
    id: "test-admin",
    email: "admin@localhost",
    name: "Admin",
    role: "admin",
  })),
}));

import { getDb } from "./db";
import { artists, concerts } from "./db/schema";
import { findConcertBySlug } from "./concert-lookup";
import { computeUpdatedConcertSlug } from "./festival-concert-update";
import { updateConcert } from "./actions";

describe("computeUpdatedConcertSlug", () => {
  it("updates multi-act slug when event name changes", () => {
    expect(
      computeUpdatedConcertSlug("Benefizkonzert für den wahren Heino", "1986-10-18", {
        isFestivalEvent: true,
        nameChanged: true,
        dateChanged: false,
      }),
    ).toBe("benefizkonzert-fur-den-wahren-heino-1986-10-18");
  });

  it("updates multi-act slug when date changes", () => {
    expect(
      computeUpdatedConcertSlug("Madstock", "1992-08-09", {
        isFestivalEvent: true,
        nameChanged: false,
        dateChanged: true,
      }),
    ).toBe("madstock-1992-08-09");
  });

  it("keeps solo concert slug until date changes", () => {
    expect(
      computeUpdatedConcertSlug("Placebo", "2022-10-06", {
        isFestivalEvent: false,
        nameChanged: true,
        dateChanged: false,
      }),
    ).toBeNull();
  });
});

describe("multi-act rename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("changes only event_title, not the owning artist slug", async () => {
    const db = getDb();
    const { artist, concert } = await findConcertBySlug(db, "madstock-1992-08-08");
    const previousArtistSlug = artist.slug;
    const previousArtistName = artist.name;
    const previousSlug = concert.slug;
    const previousTitle = concert.eventTitle || artist.name;
    const nextTitle = `${previousTitle} Rename Test`;

    try {
      await updateConcert({
        concertId: concert.id,
        artistName: nextTitle,
      });
      const updated = (
        await db.select().from(concerts).where(eq(concerts.id, concert.id)).limit(1)
      )[0]!;
      const owner = (
        await db.select().from(artists).where(eq(artists.id, artist.id)).limit(1)
      )[0]!;
      expect(updated.eventTitle).toBe(nextTitle);
      expect(owner.slug).toBe(previousArtistSlug);
      expect(owner.name).toBe(previousArtistName);
      expect(updated.id).toBe(concert.id);
    } finally {
      await db
        .update(concerts)
        .set({ eventTitle: previousTitle, slug: previousSlug })
        .where(eq(concerts.id, concert.id));
    }
  });

  it("converts a solo concert to multi_act without renaming the artist", async () => {
    const db = getDb();
    const { artist, concert } = await findConcertBySlug(db, "placebo-2022-10-06");
    const previous = {
      eventKind: concert.eventKind,
      eventTitle: concert.eventTitle,
      slug: concert.slug,
      artistSlug: artist.slug,
      artistName: artist.name,
    };

    try {
      await updateConcert({
        concertId: concert.id,
        artistName: "Placebo Open Air Test",
        multiAct: true,
      });
      const updated = (
        await db.select().from(concerts).where(eq(concerts.id, concert.id)).limit(1)
      )[0]!;
      const owner = (
        await db.select().from(artists).where(eq(artists.id, artist.id)).limit(1)
      )[0]!;
      expect(updated.eventKind).toBe("multi_act");
      expect(updated.eventTitle).toBe("Placebo Open Air Test");
      expect(owner.slug).toBe(previous.artistSlug);
      expect(owner.name).toBe(previous.artistName);
    } finally {
      await db
        .update(concerts)
        .set({
          eventKind: previous.eventKind,
          eventTitle: previous.eventTitle,
          slug: previous.slug,
        })
        .where(eq(concerts.id, concert.id));
    }
  });
});
