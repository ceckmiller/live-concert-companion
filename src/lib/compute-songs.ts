import type { ArtistPayload, Concert, ConcertAct, SongStat } from "@/types/domain";
import { resolveConcertEventKind } from "./festivals";
import { parsePosterCropJson } from "./poster-crop";

type SetlistRow = { song: string; position: number };

export function computeSongStats(
  concerts: {
    id: string;
    date: string;
    city: string;
    venue: string;
    setlist: SetlistRow[];
  }[],
): SongStat[] {
  const map = new Map<string, SongStat>();
  for (const c of concerts) {
    for (const item of c.setlist) {
      const title = item.song;
      if (!map.has(title)) {
        map.set(title, { song: title, count: 0, concerts: [] });
      }
      const row = map.get(title)!;
      row.count += 1;
      row.concerts.push({
        id: c.id,
        date: c.date,
        city: c.city,
        venue: c.venue,
        pos: item.position,
      });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.song.localeCompare(b.song, "de"),
  );
}

export function buildArtistPayload(
  artist: { id: string; slug: string; name: string },
  toursRows: { name: string; posterPath: string | null; label: string | null; kind: string | null }[],
  concertsRows: {
    id: string;
    slug: string;
    sortDate: string;
    dateLabel: string;
    city: string;
    venue: string;
    tourName: string;
    note: string | null;
    posterPath: string | null;
    posterCropJson: string | null;
    posterLabel: string | null;
    setlistFmUrl: string | null;
    eventKind?: string | null;
    eventTitle?: string | null;
    setlist: { position: number; song: string }[];
    acts?: ConcertAct[];
    videos: Record<string, string>;
    reviews: { title: string; url: string; source: string }[];
    recordings: { title: string; url: string; duration: string }[];
    festivalLabel?: string;
    artistId?: string;
    artistSlug?: string;
    artistName?: string;
    companions?: string[];
  }[],
  metaRows: {
    songTitle: string;
    origin: string;
    album: string | null;
    year: number | null;
    coverBy: string | null;
    officialVideoUrl: string | null;
  }[],
): ArtistPayload {
  const tours: ArtistPayload["tours"] = {};
  for (const t of toursRows) {
    tours[t.name] = {
      poster: t.posterPath || "",
      label: t.label || "",
      kind: t.kind || "album",
    };
  }

  const songMeta: ArtistPayload["songMeta"] = {};
  for (const m of metaRows) {
    songMeta[m.songTitle] = {
      origin: m.origin,
      album: m.album || "",
      year: m.year ?? undefined,
      by: m.coverBy || undefined,
      officialVideo: m.officialVideoUrl || undefined,
    };
  }

  const concerts: Concert[] = concertsRows.map((c) => {
    const eventKind = resolveConcertEventKind({
      id: c.id,
      slug: c.slug,
      eventKind: c.eventKind,
    });
    return {
      id: c.id,
      slug: c.slug,
      sort: c.sortDate,
      date: c.dateLabel,
      city: c.city,
      venue: c.venue,
      tour: c.tourName,
      note: c.note || undefined,
      festivalLabel: c.festivalLabel,
      eventKind,
      eventTitle: c.eventTitle || undefined,
      poster: c.posterPath || undefined,
      posterCrop: parsePosterCropJson(c.posterCropJson),
      posterLabel: c.posterLabel || undefined,
      setlistFm: c.setlistFmUrl || undefined,
      setlist: c.setlist.map((s) => s.song),
      acts: c.acts,
      videos: c.videos,
      reviews: c.reviews,
      recordings: c.recordings,
      artistId: c.artistId ?? artist.id,
      artistSlug: c.artistSlug ?? artist.slug,
      artistName: c.artistName ?? artist.name,
      companions: c.companions,
    };
  });

  const songs = computeSongStats(
    concertsRows.map((c) => ({
      id: c.id,
      date: c.dateLabel,
      city: c.city,
      venue: c.venue,
      setlist:
        c.acts?.length
          ? c.acts.flatMap((act, actIndex) =>
              act.setlist.map((song, songIndex) => ({
                song,
                position: actIndex * 100 + songIndex + 1,
              })),
            )
          : c.setlist,
    })),
  );

  const berlin = concerts.filter((c) => /berlin/i.test(c.city)).length;
  const once = songs.filter((s) => s.count === 1).length;
  const totalSlots = songs.reduce((sum, s) => sum + s.count, 0);

  return {
    artist,
    tours,
    concerts,
    songMeta,
    songs,
    stats: {
      concerts: concerts.length,
      berlin,
      uniqueSongs: songs.length,
      once,
      totalSlots,
    },
  };
}
