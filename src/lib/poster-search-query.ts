import { buildDefaultConcertPosterQuery } from "../../scripts/tour-poster-search.mjs";

export function defaultPosterSearchQuery(
  artistName: string,
  tourName: string,
  city: string,
  year: string,
): string {
  const artist = artistName.trim();
  const tour = tourName.trim() || artist;
  return buildDefaultConcertPosterQuery(artist, tour, year.trim(), city.trim());
}
