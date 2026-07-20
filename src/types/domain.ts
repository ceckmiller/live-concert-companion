import type { PosterCrop } from "@/lib/poster-crop";

export type SongMeta = {
  origin: string;
  album?: string;
  year?: number;
  by?: string;
  officialVideo?: string;
};

export type ConcertAct = {
  artistSlug: string;
  artistName: string;
  setlist: string[];
  videos?: Record<string, string>;
  setlistFm?: string;
  note?: string;
  setlistComplete?: boolean;
};

export type Concert = {
  id: string;
  sort: string;
  date: string;
  city: string;
  venue: string;
  tour: string;
  note?: string;
  poster?: string;
  posterCrop?: PosterCrop;
  posterLabel?: string;
  setlistFm?: string;
  setlist: string[];
  acts?: ConcertAct[];
  videos?: Record<string, string>;
  reviews?: { title: string; url: string; source: string }[];
  recordings?: { title: string; url: string; duration: string }[];
  artistSlug?: string;
  artistName?: string;
};

export type ArtistContext = {
  artist: { id: string; slug: string; name: string };
  tours: Record<string, { poster: string; label: string; kind: string }>;
  songMeta: Record<string, SongMeta>;
};

export type HomePayload = {
  artists: ArtistListItem[];
  artistsBySlug: Record<string, ArtistContext>;
  concerts: Concert[];
  stats: {
    concerts: number;
    artists: number;
    years: number;
  };
};

export type SongStat = {
  song: string;
  count: number;
  concerts: { id: string; date: string; city: string; venue: string; pos: number }[];
};

export type ArtistPayload = {
  artist: { id: string; slug: string; name: string };
  tours: Record<string, { poster: string; label: string; kind: string }>;
  concerts: Concert[];
  songMeta: Record<string, SongMeta>;
  artistsBySlug?: Record<string, Pick<ArtistContext, "artist" | "songMeta">>;
  songs: SongStat[];
  stats: {
    concerts: number;
    berlin: number;
    uniqueSongs: number;
    once: number;
    totalSlots: number;
  };
};

export type ArtistListItem = {
  slug: string;
  name: string;
  image_path: string | null;
  concert_count: number;
};
