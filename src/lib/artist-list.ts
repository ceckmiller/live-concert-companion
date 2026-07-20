import { isFestivalArtist } from "./festivals";

/** Headliners with concerts — excludes festival pseudo-artists (Madstock, PxP, …). */
export function filterHeadlinerArtists<T extends { slug: string; concert_count: number }>(
  artists: T[],
): T[] {
  return artists.filter((a) => a.concert_count > 0 && !isFestivalArtist(a.slug));
}
