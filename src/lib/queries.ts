import { asc, eq, inArray, sql } from "drizzle-orm";
import { filterHeadlinerArtists } from "./artist-list";
import { buildArtistPayload } from "./compute-songs";
import {
  isChronologyConcert,
  isFestivalSectionConcert,
  shouldIncludeFestivalAct,
} from "./festivals";
import { getDb } from "./db";
import { parsePosterCropJson } from "./poster-crop";
import {
  artists,
  concertActs,
  concertVideos,
  concerts,
  recordings,
  reviews,
  setlistItems,
  songMeta,
  tours,
} from "./db/schema";
import type { ArtistListItem, ArtistPayload, Concert, ConcertAct, HomePayload } from "@/types/domain";

function mapConcertRow(
  c: {
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
    hidden?: boolean | null;
  },
  extras: {
    setlist: string[];
    acts?: ConcertAct[];
    videos?: Record<string, string>;
    reviews?: { title: string; url: string; source: string }[];
    recordings?: { title: string; url: string; duration: string }[];
    artistSlug?: string;
    artistName?: string;
    festivalLabel?: string;
  },
): Concert {
  return {
    id: c.slug,
    sort: c.sortDate,
    date: c.dateLabel,
    city: c.city,
    venue: c.venue,
    tour: c.tourName,
    note: c.note || undefined,
    poster: c.posterPath || undefined,
    posterCrop: parsePosterCropJson(c.posterCropJson),
    posterLabel: c.posterLabel || undefined,
    setlistFm: c.setlistFmUrl || undefined,
    hidden: c.hidden === true,
    festivalLabel: extras.festivalLabel,
    setlist: extras.setlist,
    acts: extras.acts,
    videos: extras.videos,
    reviews: extras.reviews,
    recordings: extras.recordings,
    artistSlug: extras.artistSlug,
    artistName: extras.artistName,
  };
}

function parseConcertActs(
  rows: {
    concertId: string;
    position: number;
    artistSlug: string;
    artistName: string;
    setlistFmUrl: string | null;
    note: string | null;
    setlistComplete: boolean | null;
    setlistJson: string;
    videosJson: string;
  }[],
  concertId: string,
): ConcertAct[] {
  return rows
    .filter((r) => r.concertId === concertId)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      artistSlug: r.artistSlug,
      artistName: r.artistName,
      setlist: JSON.parse(r.setlistJson) as string[],
      videos: JSON.parse(r.videosJson) as Record<string, string>,
      setlistFm: r.setlistFmUrl || undefined,
      note: r.note || undefined,
      setlistComplete: r.setlistComplete !== false,
    }));
}

export async function listArtists(): Promise<ArtistListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      slug: artists.slug,
      name: artists.name,
      image_path: artists.imagePath,
      concert_count: sql<number>`count(${concerts.id})`.mapWith(Number),
    })
    .from(artists)
    .leftJoin(concerts, eq(concerts.artistId, artists.id))
    .groupBy(artists.id)
    .having(sql`count(${concerts.id}) > 0`)
    .orderBy(artists.name);

  return rows;
}

export async function loadArtistBySlug(slug: string): Promise<ArtistPayload | null> {
  const db = getDb();
  const artistRows = await db.select().from(artists).where(eq(artists.slug, slug)).limit(1);
  const artist = artistRows[0];
  if (!artist) return null;

  const [tourRows, concertRows, metaRows, guestActRows] = await Promise.all([
    db.select().from(tours).where(eq(tours.artistId, artist.id)).orderBy(tours.name),
    db
      .select()
      .from(concerts)
      .where(eq(concerts.artistId, artist.id))
      .orderBy(sql`${concerts.sortDate} DESC`),
    db.select().from(songMeta).where(eq(songMeta.artistId, artist.id)),
    db
      .select({
        concertId: concertActs.concertId,
        position: concertActs.position,
        artistSlug: concertActs.artistSlug,
        artistName: concertActs.artistName,
        setlistFmUrl: concertActs.setlistFmUrl,
        note: concertActs.note,
        setlistComplete: concertActs.setlistComplete,
        setlistJson: concertActs.setlistJson,
        videosJson: concertActs.videosJson,
        parentSlug: concerts.slug,
        sortDate: concerts.sortDate,
        dateLabel: concerts.dateLabel,
        city: concerts.city,
        venue: concerts.venue,
        tourName: concerts.tourName,
        parentNote: concerts.note,
        posterPath: concerts.posterPath,
        posterCropJson: concerts.posterCropJson,
        posterLabel: concerts.posterLabel,
        parentSetlistFmUrl: concerts.setlistFmUrl,
        hidden: concerts.hidden,
        festivalName: artists.name,
        festivalSlug: artists.slug,
      })
      .from(concertActs)
      .innerJoin(concerts, eq(concerts.id, concertActs.concertId))
      .innerJoin(artists, eq(artists.id, concerts.artistId))
      .where(eq(concertActs.artistSlug, slug)),
  ]);

  const visibleHeadliners = concertRows.filter((c) => !c.hidden);
  const guestParentIds = [
    ...new Set(
      guestActRows.filter((r) => !r.hidden).map((r) => r.concertId),
    ),
  ];

  const concertIds = visibleHeadliners.map((c) => c.id);
  const lookupIds = [...new Set([...concertIds, ...guestParentIds])];
  const [setlistRows, videoRows, reviewRows, recordingRows, actRows] = lookupIds.length
    ? await Promise.all([
        db
          .select()
          .from(setlistItems)
          .where(inArray(setlistItems.concertId, lookupIds))
          .orderBy(asc(setlistItems.position)),
        db
          .select({
            concertId: concertVideos.concertId,
            songTitle: concertVideos.songTitle,
            url: concertVideos.url,
            slug: concerts.slug,
          })
          .from(concertVideos)
          .innerJoin(concerts, eq(concerts.id, concertVideos.concertId))
          .where(inArray(concertVideos.concertId, lookupIds)),
        db.select().from(reviews).where(inArray(reviews.concertId, lookupIds)),
        db.select().from(recordings).where(inArray(recordings.concertId, lookupIds)),
        db
          .select({
            concertId: concertActs.concertId,
            position: concertActs.position,
            artistSlug: concertActs.artistSlug,
            artistName: concertActs.artistName,
            setlistFmUrl: concertActs.setlistFmUrl,
            note: concertActs.note,
            setlistComplete: concertActs.setlistComplete,
            setlistJson: concertActs.setlistJson,
            videosJson: concertActs.videosJson,
          })
          .from(concertActs)
          .where(inArray(concertActs.concertId, lookupIds))
          .orderBy(asc(concertActs.position)),
      ])
    : [[], [], [], [], []];

  const setlistByConcert = new Map<string, { position: number; song: string }[]>();
  for (const row of setlistRows) {
    const list = setlistByConcert.get(row.concertId) ?? [];
    list.push({ position: row.position, song: row.songTitle });
    setlistByConcert.set(row.concertId, list);
  }

  const headlinerPayload = visibleHeadliners.map((c) => {
    const videos: Record<string, string> = {};
    for (const v of videoRows) {
      if (v.concertId === c.id) videos[v.songTitle] = v.url;
    }
    const acts = parseConcertActs(actRows, c.id);
    const flatSetlist = (setlistByConcert.get(c.id) ?? []).map((s) => s.song);
    return mapConcertRow(c, {
      setlist: flatSetlist.length ? flatSetlist : acts.flatMap((act) => act.setlist),
      acts: acts.length ? acts : undefined,
      videos,
      reviews: reviewRows
        .filter((r) => r.concertId === c.id)
        .map(({ title, url, source }) => ({ title, url, source })),
      recordings: recordingRows
        .filter((r) => r.concertId === c.id)
        .map(({ title, url, duration }) => ({ title, url, duration })),
    });
  });

  const headlinerForActCheck = headlinerPayload.map((c) => ({ id: c.id, sort: c.sort }));
  const guestPayload = guestActRows
    .filter((row) => !row.hidden)
    .filter((row) =>
      shouldIncludeFestivalAct(slug, row.parentSlug, row.sortDate, headlinerForActCheck),
    )
    .map((row) => {
      const act: ConcertAct = {
        artistSlug: row.artistSlug,
        artistName: row.artistName,
        setlist: JSON.parse(row.setlistJson) as string[],
        videos: JSON.parse(row.videosJson) as Record<string, string>,
        setlistFm: row.setlistFmUrl || undefined,
        note: row.note || undefined,
        setlistComplete: row.setlistComplete !== false,
      };
      return mapConcertRow(
        {
          slug: row.parentSlug,
          sortDate: row.sortDate,
          dateLabel: row.dateLabel,
          city: row.city,
          venue: row.venue,
          tourName: row.tourName,
          note: row.parentNote,
          posterPath: row.posterPath,
          posterCropJson: row.posterCropJson,
          posterLabel: row.posterLabel,
          setlistFmUrl: row.parentSetlistFmUrl,
          hidden: false,
        },
        {
          setlist: [],
          acts: [act],
          festivalLabel: row.festivalName,
          reviews: reviewRows
            .filter((r) => r.concertId === row.concertId)
            .map(({ title, url, source }) => ({ title, url, source })),
          recordings: recordingRows
            .filter((r) => r.concertId === row.concertId)
            .map(({ title, url, duration }) => ({ title, url, duration })),
        },
      );
    });

  const concertsPayload = [...headlinerPayload, ...guestPayload].sort((a, b) =>
    b.sort.localeCompare(a.sort),
  );

  return {
    ...buildArtistPayload(
      artist,
      tourRows.map((t) => ({
        name: t.name,
        posterPath: t.posterPath,
        label: t.label,
        kind: t.kind,
      })),
      concertsPayload.map((c) => ({
        slug: c.id,
        sortDate: c.sort,
        dateLabel: c.date,
        city: c.city,
        venue: c.venue,
        tourName: c.tour,
        note: c.note ?? null,
        posterPath: c.poster ?? null,
        posterCropJson: c.posterCrop ? JSON.stringify(c.posterCrop) : null,
        posterLabel: c.posterLabel ?? null,
        setlistFmUrl: c.setlistFm ?? null,
        setlist: c.setlist.map((song, index) => ({ position: index + 1, song })),
        acts: c.acts,
        videos: c.videos ?? {},
        reviews: c.reviews ?? [],
        recordings: c.recordings ?? [],
        festivalLabel: c.festivalLabel,
      })),
      metaRows.map((m) => ({
        songTitle: m.songTitle,
        origin: m.origin,
        album: m.album,
        year: m.year,
        coverBy: m.coverBy,
        officialVideoUrl: m.officialVideoUrl,
      })),
    ),
    artistsBySlug: await buildArtistsBySlug(
      db,
      [...actRows, ...guestActRows.map((r) => ({ artistSlug: r.artistSlug }))],
      artist.slug,
      metaRows,
    ),
  };
}

async function buildArtistsBySlug(
  db: ReturnType<typeof getDb>,
  actRows: { artistSlug: string }[],
  mainSlug: string,
  mainMetaRows: {
    songTitle: string;
    origin: string;
    album: string | null;
    year: number | null;
    coverBy: string | null;
    officialVideoUrl: string | null;
  }[],
): Promise<Record<string, Pick<import("@/types/domain").ArtistContext, "artist" | "songMeta">>> {
  const slugs = new Set([mainSlug, ...actRows.map((r) => r.artistSlug)]);
  const artistRows = await db
    .select()
    .from(artists)
    .where(inArray(artists.slug, [...slugs]));
  const artistIds = artistRows.map((a) => a.id);
  const metaRows = artistIds.length
    ? await db.select().from(songMeta).where(inArray(songMeta.artistId, artistIds))
    : [];
  const out: Record<string, Pick<import("@/types/domain").ArtistContext, "artist" | "songMeta">> = {};
  for (const a of artistRows) {
    out[a.slug] = {
      artist: { id: a.id, slug: a.slug, name: a.name },
      songMeta: mapSongMetaRows(metaRows.filter((m) => m.artistId === a.id)),
    };
  }
  if (!out[mainSlug]) {
    out[mainSlug] = {
      artist: { id: "", slug: mainSlug, name: mainSlug },
      songMeta: mapSongMetaRows(mainMetaRows),
    };
  }
  return out;
}

function mapSongMetaRows(
  metaRows: {
    songTitle: string;
    origin: string;
    album: string | null;
    year: number | null;
    coverBy: string | null;
    officialVideoUrl: string | null;
  }[],
): Record<string, import("@/types/domain").SongMeta> {
  const songMeta: Record<string, import("@/types/domain").SongMeta> = {};
  for (const m of metaRows) {
    songMeta[m.songTitle] = {
      origin: m.origin,
      album: m.album || "",
      year: m.year ?? undefined,
      by: m.coverBy || undefined,
      officialVideo: m.officialVideoUrl || undefined,
    };
  }
  return songMeta;
}

function mapToursRows(
  tourRows: { name: string; posterPath: string | null; label: string | null; kind: string | null }[],
): ArtistPayload["tours"] {
  const tours: ArtistPayload["tours"] = {};
  for (const t of tourRows) {
    tours[t.name] = {
      poster: t.posterPath || "",
      label: t.label || "",
      kind: t.kind || "album",
    };
  }
  return tours;
}

export async function loadHomeDashboard(): Promise<HomePayload> {
  const db = getDb();
  const [artistRows, concertRows, tourRows, metaRows] = await Promise.all([
    db.select().from(artists).orderBy(artists.name),
    db
      .select({
        id: concerts.id,
        slug: concerts.slug,
        sortDate: concerts.sortDate,
        dateLabel: concerts.dateLabel,
        city: concerts.city,
        venue: concerts.venue,
        tourName: concerts.tourName,
        note: concerts.note,
        posterPath: concerts.posterPath,
        posterCropJson: concerts.posterCropJson,
        posterLabel: concerts.posterLabel,
        setlistFmUrl: concerts.setlistFmUrl,
        hidden: concerts.hidden,
        artistId: concerts.artistId,
        artistSlug: artists.slug,
        artistName: artists.name,
      })
      .from(concerts)
      .innerJoin(artists, eq(concerts.artistId, artists.id))
      .orderBy(sql`${concerts.sortDate} DESC`),
    db.select().from(tours),
    db.select().from(songMeta),
  ]);

  const concertIds = concertRows.map((c) => c.id);
  const [setlistRows, videoRows, reviewRows, recordingRows, actRows] = concertIds.length
    ? await Promise.all([
        db
          .select()
          .from(setlistItems)
          .where(inArray(setlistItems.concertId, concertIds))
          .orderBy(asc(setlistItems.position)),
        db.select().from(concertVideos).where(inArray(concertVideos.concertId, concertIds)),
        db.select().from(reviews).where(inArray(reviews.concertId, concertIds)),
        db.select().from(recordings).where(inArray(recordings.concertId, concertIds)),
        db
          .select({
            concertId: concertActs.concertId,
            position: concertActs.position,
            artistSlug: concertActs.artistSlug,
            artistName: concertActs.artistName,
            setlistFmUrl: concertActs.setlistFmUrl,
            note: concertActs.note,
            setlistComplete: concertActs.setlistComplete,
            setlistJson: concertActs.setlistJson,
            videosJson: concertActs.videosJson,
          })
          .from(concertActs)
          .where(inArray(concertActs.concertId, concertIds))
          .orderBy(asc(concertActs.position)),
      ])
    : [[], [], [], [], []];

  const setlistByConcert = new Map<string, { position: number; song: string }[]>();
  for (const row of setlistRows) {
    const list = setlistByConcert.get(row.concertId) ?? [];
    list.push({ position: row.position, song: row.songTitle });
    setlistByConcert.set(row.concertId, list);
  }

  const videosByConcert = new Map<string, Record<string, string>>();
  for (const v of videoRows) {
    const videos = videosByConcert.get(v.concertId) ?? {};
    videos[v.songTitle] = v.url;
    videosByConcert.set(v.concertId, videos);
  }

  const artistsBySlug: HomePayload["artistsBySlug"] = {};
  for (const a of artistRows) {
    artistsBySlug[a.slug] = {
      artist: { id: a.id, slug: a.slug, name: a.name },
      tours: mapToursRows(tourRows.filter((t) => t.artistId === a.id)),
      songMeta: mapSongMetaRows(metaRows.filter((m) => m.artistId === a.id)),
    };
  }

  const allConcerts = concertRows.map((c) => {
    const acts = parseConcertActs(actRows, c.id);
    const flatSetlist = (setlistByConcert.get(c.id) ?? []).map((s) => s.song);
    return mapConcertRow(c, {
      setlist: flatSetlist.length ? flatSetlist : acts.flatMap((act) => act.setlist),
      acts: acts.length ? acts : undefined,
      videos: videosByConcert.get(c.id),
      reviews: reviewRows
        .filter((r) => r.concertId === c.id)
        .map(({ title, url, source }) => ({ title, url, source })),
      recordings: recordingRows
        .filter((r) => r.concertId === c.id)
        .map(({ title, url, duration }) => ({ title, url, duration })),
      artistSlug: c.artistSlug,
      artistName: c.artistName,
    });
  });

  const visibleConcerts = allConcerts.filter((c) => !c.hidden);
  const chronologyConcerts = visibleConcerts.filter(isChronologyConcert);
  const festivalConcerts = visibleConcerts.filter(isFestivalSectionConcert);
  const hiddenConcerts = allConcerts.filter((c) => c.hidden);

  const years = new Set(chronologyConcerts.map((c) => c.sort.slice(0, 4)));

  const headlinerArtists = filterHeadlinerArtists(
    artistRows.map((a) => ({
      slug: a.slug,
      name: a.name,
      image_path: a.imagePath,
      concert_count: concertRows.filter((c) => c.artistId === a.id && !c.hidden).length,
    })),
  );

  return {
    artists: headlinerArtists,
    artistsBySlug,
    concerts: chronologyConcerts,
    festivals: festivalConcerts,
    hiddenConcerts,
    stats: {
      concerts: chronologyConcerts.length + festivalConcerts.length,
      artists: headlinerArtists.length,
      years: years.size,
    },
  };
}
