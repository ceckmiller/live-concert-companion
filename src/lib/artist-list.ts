import {
  isChronologyConcert,
  isFestivalArtist,
  isFestivalPseudoArtist,
  shouldIncludeFestivalAct,
} from "./festivals";

type HeadlinerConcertRef = {
  id: string;
  slug?: string | null;
  sort: string;
  hidden?: boolean | null;
  eventKind?: string | null;
};
type GuestActRef = { parentSlug: string; sortDate: string; hidden?: boolean | null };

export type ArtistListRow = {
  id: string;
  slug: string;
  name: string;
  image_path: string | null;
  concert_count: number;
  headlinerConcerts: HeadlinerConcertRef[];
};

/** Matches the concert cards shown on the artist detail page (headliners + festival guest slots). */
export function countArtistVisibleConcerts(
  artistSlug: string,
  headlinerConcerts: HeadlinerConcertRef[],
  guestActs: GuestActRef[] = [],
): number {
  const visibleHeadliners = headlinerConcerts.filter((c) => !c.hidden);
  const headlinerForActCheck = visibleHeadliners.map((c) => ({ id: c.id, sort: c.sort }));
  const includedGuestActs = guestActs
    .filter((row) => !row.hidden)
    .filter((row) =>
      shouldIncludeFestivalAct(artistSlug, row.parentSlug, row.sortDate, headlinerForActCheck),
    );
  return visibleHeadliners.length + includedGuestActs.length;
}

function hasSoloHeadlinerConcerts(headlinerConcerts: HeadlinerConcertRef[]): boolean {
  return headlinerConcerts.some((c) => {
    if (c.hidden) return false;
    return isChronologyConcert({
      id: c.id,
      slug: c.slug,
      hidden: Boolean(c.hidden),
      eventKind: c.eventKind,
    });
  });
}

/** Headliners with solo concerts — excludes festival pseudo-artists. */
export function filterSoloConcertArtists(artists: ArtistListRow[]): ArtistListRow[] {
  return artists.filter(
    (a) =>
      a.concert_count > 0 &&
      !isFestivalPseudoArtist(a.slug, a.headlinerConcerts) &&
      hasSoloHeadlinerConcerts(a.headlinerConcerts),
  );
}

/** Artists seen only as festival guests (no own solo headliner concerts). */
export function filterFestivalGuestArtists(artists: ArtistListRow[]): ArtistListRow[] {
  return artists.filter(
    (a) =>
      a.concert_count > 0 &&
      !isFestivalPseudoArtist(a.slug, a.headlinerConcerts) &&
      !hasSoloHeadlinerConcerts(a.headlinerConcerts),
  );
}

/** @deprecated use filterSoloConcertArtists */
export function filterHeadlinerArtists<T extends { slug: string; concert_count: number }>(
  artists: T[],
): T[] {
  return artists.filter((a) => a.concert_count > 0 && !isFestivalArtist(a.slug));
}

export function sortArtistsByName<T extends { name: string }>(artists: T[]): T[] {
  return [...artists].sort((a, b) => a.name.localeCompare(b.name, "de"));
}
