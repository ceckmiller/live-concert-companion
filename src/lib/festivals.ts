/** Pseudo-artists that represent multi-act festivals — not shown in the Künstler list. */
export const FESTIVAL_ARTIST_SLUGS = new Set([
  "peace-by-peace",
  "madstock",
  "konzert-fuer-berlin",
  "benefizkonzert-fur-den-wahren-heino",
  "ferropolis-open-air",
  /** @deprecated seed/local alias */
  "heino-aid",
]);

/** Legacy catalog slugs for multi-act events (fallback when event_kind missing). */
export const FESTIVAL_CONCERT_IDS = new Set([
  "madstock-1992-08-08",
  "peace-by-peace-2016-06-05",
  "peace-by-peace-2017-06-18",
  "konzert-fuer-berlin-1989-11-12",
  "benefizkonzert-fur-den-wahren-heino-1986-10-18",
  /** @deprecated seed/local alias */
  "heino-aid-1986-10-18",
  "seeed-2014-08-22",
  "ferropolis-open-air-2014-08-22",
]);

/**
 * Mirrored festival slots on an artist page (e.g. Bilderbuch @ PxP 2017).
 * Shown on the artist page, omitted from the home timeline.
 */
export const FESTIVAL_SLOT_CONCERT_IDS = new Set(["bilderbuch-2017-06-18"]);

export type ConcertEventKind = "solo" | "multi_act" | "festival_slot";

type ConcertRef = {
  id: string;
  slug?: string | null;
  eventKind?: string | null;
  hidden?: boolean;
};

function legacyCatalogKey(concert: { id: string; slug?: string | null }): string {
  return concert.slug || concert.id;
}

export function normalizeEventKind(raw: string | null | undefined): ConcertEventKind | null {
  if (raw === "multi_act" || raw === "festival") return "multi_act";
  if (raw === "festival_slot" || raw === "solo") return raw;
  return null;
}

export function resolveConcertEventKind(concert: {
  id: string;
  slug?: string | null;
  eventKind?: string | null;
}): ConcertEventKind {
  const fromDb = normalizeEventKind(concert.eventKind);
  if (fromDb) return fromDb;
  const key = legacyCatalogKey(concert);
  if (FESTIVAL_SLOT_CONCERT_IDS.has(key)) return "festival_slot";
  if (FESTIVAL_CONCERT_IDS.has(key)) return "multi_act";
  return "solo";
}

export function isFestivalArtist(slug: string): boolean {
  return FESTIVAL_ARTIST_SLUGS.has(slug);
}

/** Pseudo-artist when all owned headliner rows are multi-act events. */
export function isFestivalPseudoArtist(
  slug: string,
  headlinerConcerts: { id: string; slug?: string | null; eventKind?: string | null }[],
): boolean {
  if (FESTIVAL_ARTIST_SLUGS.has(slug)) return true;
  if (headlinerConcerts.length === 0) return false;
  return headlinerConcerts.every((c) => isMultiActConcert(c));
}

export function isMultiActConcert(concert: {
  id: string;
  slug?: string | null;
  eventKind?: string | null;
}): boolean {
  return resolveConcertEventKind(concert) === "multi_act";
}

/** @deprecated use isMultiActConcert */
export function isFestivalConcert(concert: {
  id: string;
  slug?: string | null;
  eventKind?: string | null;
}): boolean {
  return isMultiActConcert(concert);
}

export function isFestivalSlotConcert(concert: {
  id: string;
  slug?: string | null;
  eventKind?: string | null;
}): boolean {
  return resolveConcertEventKind(concert) === "festival_slot";
}

/** Solo concerts only (excludes multi-act from "solo artist" checks). */
export function isChronologyConcert(concert: ConcertRef): boolean {
  if (concert.hidden) return false;
  return resolveConcertEventKind(concert) === "solo";
}

/** Home timeline: solo + multi_act (excludes mirrored festival_slot rows). */
export function isTimelineConcert(concert: ConcertRef): boolean {
  if (concert.hidden) return false;
  const kind = resolveConcertEventKind(concert);
  return kind === "solo" || kind === "multi_act";
}

/** @deprecated use isMultiActConcert + isTimelineConcert */
export function isFestivalSectionConcert(concert: ConcertRef): boolean {
  if (concert.hidden) return false;
  return resolveConcertEventKind(concert) === "multi_act";
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

export function isMultiActEventHeadliner(
  concert: ConcertRef & { festivalLabel?: string },
): boolean {
  return isMultiActConcert(concert) && !concert.festivalLabel;
}

/** @deprecated use isMultiActEventHeadliner */
export function isFestivalEventHeadliner(
  concert: ConcertRef & { festivalLabel?: string },
): boolean {
  return isMultiActEventHeadliner(concert);
}
