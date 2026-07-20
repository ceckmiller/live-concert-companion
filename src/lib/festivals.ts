/** Pseudo-artists that represent multi-act festivals — not shown in the Künstler list. */
export const FESTIVAL_ARTIST_SLUGS = new Set([
  "peace-by-peace",
  "madstock",
  "konzert-fuer-berlin",
  "heino-aid",
]);

/** Headliner rows for festival events (shown in the Festivals section, not main chronology). */
export const FESTIVAL_CONCERT_IDS = new Set([
  "madstock-1992-08-08",
  "peace-by-peace-2016-06-05",
  "peace-by-peace-2017-06-18",
  "konzert-fuer-berlin-1989-11-12",
  "heino-aid-1986-10-18",
  "seeed-2014-08-22",
]);

/**
 * Mirrored festival slots on an artist page (e.g. Bilderbuch @ PxP 2017).
 * Shown on the artist page, omitted from chronology and festival list.
 */
export const FESTIVAL_SLOT_CONCERT_IDS = new Set(["bilderbuch-2017-06-18"]);

export function isFestivalArtist(slug: string): boolean {
  return FESTIVAL_ARTIST_SLUGS.has(slug);
}

export function isFestivalConcert(concertId: string): boolean {
  return FESTIVAL_CONCERT_IDS.has(concertId);
}

export function isFestivalSlotConcert(concertId: string): boolean {
  return FESTIVAL_SLOT_CONCERT_IDS.has(concertId);
}

export function isChronologyConcert(concert: { id: string; hidden?: boolean }): boolean {
  if (concert.hidden) return false;
  return !isFestivalConcert(concert.id) && !isFestivalSlotConcert(concert.id);
}

export function isFestivalSectionConcert(concert: { id: string; hidden?: boolean }): boolean {
  if (concert.hidden) return false;
  return isFestivalConcert(concert.id);
}

/** Skip festival act when the artist already has a headliner row on the same date. */
export function shouldIncludeFestivalAct(
  _artistSlug: string,
  _parentConcertId: string,
  sortDate: string,
  headlinerConcerts: { id: string; sort: string }[],
): boolean {
  return !headlinerConcerts.some((c) => c.sort === sortDate);
}
