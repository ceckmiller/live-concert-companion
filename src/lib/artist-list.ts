/** Only artists with their own concert entries — not festival support acts seeded via `concert_acts`. */
export function filterHeadlinerArtists<T extends { concert_count: number }>(artists: T[]): T[] {
  return artists.filter((a) => a.concert_count > 0);
}
