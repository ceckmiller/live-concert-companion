import { asc, eq, inArray, sql } from "drizzle-orm";
import {
  countArtistVisibleConcerts,
  filterFestivalGuestArtists,
  filterSoloConcertArtists,
  sortArtistsByName,
} from "./artist-list";
import { buildArtistPayload } from "./compute-songs";
import {
  isTimelineConcert,
  resolveConcertEventKind,
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
import type {
  ArtistListItem,
  ArtistPayload,
  Concert,
  ConcertAct,
  ConcertPayload,
  HomePayload,
} from "@/types/domain";

function mapConcertRow(
  c: {
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
    hidden?: boolean | null;
    eventKind?: string | null;
    eventTitle?: string | null;
    artistId?: string | null;
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
    poster: c.posterPath || undefined,
    posterCrop: parsePosterCropJson(c.posterCropJson),
    posterLabel: c.posterLabel || undefined,
    setlistFm: c.setlistFmUrl || undefined,
    hidden: c.hidden === true,
    eventKind,
    eventTitle: c.eventTitle || undefined,
    festivalLabel: extras.festivalLabel,
    setlist: extras.setlist,
    acts: extras.acts,
    videos: extras.videos,
    reviews: extras.reviews,
    recordings: extras.recordings,
    artistId: c.artistId || undefined,
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
  artistIdBySlug?: Map<string, string>,
): ConcertAct[] {
  return rows
    .filter((r) => r.concertId === concertId)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      artistSlug: r.artistSlug,
      artistName: r.artistName,
      artistId: artistIdBySlug?.get(r.artistSlug),
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
      id: artists.id,
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

async function loadArtistPayload(artist: {
  id: string;
  slug: string;
  name: string;
}): Promise<ArtistPayload> {
  const db = getDb();
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
        parentEventKind: concerts.eventKind,
        parentEventTitle: concerts.eventTitle,
        hidden: concerts.hidden,
        festivalName: artists.name,
        festivalSlug: artists.slug,
        festivalArtistId: artists.id,
      })
      .from(concertActs)
      .innerJoin(concerts, eq(concerts.id, concertActs.concertId))
      .innerJoin(artists, eq(artists.id, concerts.artistId))
      .where(eq(concertActs.artistSlug, artist.slug)),
  ]);

  const visibleHeadliners = concertRows.filter((c) => !c.hidden);
  const guestParentIds = [
    ...new Set(guestActRows.filter((r) => !r.hidden).map((r) => r.concertId)),
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
          })
          .from(concertVideos)
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

  const artistsBySlugMap = await buildArtistsBySlug(
    db,
    [...actRows, ...guestActRows.map((r) => ({ artistSlug: r.artistSlug }))],
    artist.slug,
    metaRows,
  );
  const artistIdBySlug = new Map(
    Object.values(artistsBySlugMap).map((ctx) => [ctx.artist.slug, ctx.artist.id]),
  );

  const headlinerPayload = visibleHeadliners.map((c) => {
    const videos: Record<string, string> = {};
    for (const v of videoRows) {
      if (v.concertId === c.id) videos[v.songTitle] = v.url;
    }
    const acts = parseConcertActs(actRows, c.id, artistIdBySlug);
    const flatSetlist = (setlistByConcert.get(c.id) ?? []).map((s) => s.song);
    return mapConcertRow(
      {
        ...c,
        artistId: artist.id,
      },
      {
        setlist: flatSetlist.length ? flatSetlist : acts.flatMap((act) => act.setlist),
        acts: acts.length ? acts : undefined,
        videos,
        reviews: reviewRows
          .filter((r) => r.concertId === c.id)
          .map(({ title, url, source }) => ({ title, url, source })),
        recordings: recordingRows
          .filter((r) => r.concertId === c.id)
          .map(({ title, url, duration }) => ({ title, url, duration })),
        artistSlug: artist.slug,
        artistName: artist.name,
      },
    );
  });

  const headlinerForActCheck = headlinerPayload.map((c) => ({ id: c.id, sort: c.sort }));
  const guestPayload = guestActRows
    .filter((row) => !row.hidden)
    .filter((row) =>
      shouldIncludeFestivalAct(artist.slug, row.parentSlug, row.sortDate, headlinerForActCheck),
    )
    .map((row) => {
      const act: ConcertAct = {
        artistSlug: row.artistSlug,
        artistName: row.artistName,
        artistId: artist.id,
        setlist: JSON.parse(row.setlistJson) as string[],
        videos: JSON.parse(row.videosJson) as Record<string, string>,
        setlistFm: row.setlistFmUrl || undefined,
        note: row.note || undefined,
        setlistComplete: row.setlistComplete !== false,
      };
      return mapConcertRow(
        {
          id: row.concertId,
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
          eventKind: row.parentEventKind,
          eventTitle: row.parentEventTitle,
          artistId: row.festivalArtistId,
        },
        {
          setlist: [],
          acts: [act],
          festivalLabel: row.festivalName,
          artistSlug: row.festivalSlug,
          artistName: row.festivalName,
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
        id: c.id,
        slug: c.slug,
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
        eventKind: c.eventKind,
        eventTitle: c.eventTitle ?? null,
        setlist: c.setlist.map((song, index) => ({ position: index + 1, song })),
        acts: c.acts,
        videos: c.videos ?? {},
        reviews: c.reviews ?? [],
        recordings: c.recordings ?? [],
        festivalLabel: c.festivalLabel,
        artistId: c.artistId,
        artistSlug: c.artistSlug,
        artistName: c.artistName,
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
    artistsBySlug: artistsBySlugMap,
  };
}

export async function loadArtistById(id: string): Promise<ArtistPayload | null> {
  const db = getDb();
  const artist = (await db.select().from(artists).where(eq(artists.id, id)).limit(1))[0];
  if (!artist) return null;
  return loadArtistPayload(artist);
}

export async function loadArtistBySlug(slug: string): Promise<ArtistPayload | null> {
  const db = getDb();
  const artist = (await db.select().from(artists).where(eq(artists.slug, slug)).limit(1))[0];
  if (!artist) return null;
  return loadArtistPayload(artist);
}

export async function loadConcertById(id: string): Promise<ConcertPayload | null> {
  const db = getDb();
  const row = (
    await db
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
        eventKind: concerts.eventKind,
        eventTitle: concerts.eventTitle,
        artistId: concerts.artistId,
        artistSlug: artists.slug,
        artistName: artists.name,
      })
      .from(concerts)
      .innerJoin(artists, eq(concerts.artistId, artists.id))
      .where(eq(concerts.id, id))
      .limit(1)
  )[0];
  if (!row) return null;

  const [setlistRows, videoRows, reviewRows, recordingRows, actRows, tourRows, metaRows] =
    await Promise.all([
      db
        .select()
        .from(setlistItems)
        .where(eq(setlistItems.concertId, row.id))
        .orderBy(asc(setlistItems.position)),
      db.select().from(concertVideos).where(eq(concertVideos.concertId, row.id)),
      db.select().from(reviews).where(eq(reviews.concertId, row.id)),
      db.select().from(recordings).where(eq(recordings.concertId, row.id)),
      db
        .select()
        .from(concertActs)
        .where(eq(concertActs.concertId, row.id))
        .orderBy(asc(concertActs.position)),
      db.select().from(tours).where(eq(tours.artistId, row.artistId)),
      db.select().from(songMeta).where(eq(songMeta.artistId, row.artistId)),
    ]);

  const artistsBySlugMap = await buildArtistsBySlug(
    db,
    actRows.map((r) => ({ artistSlug: r.artistSlug })),
    row.artistSlug,
    metaRows,
  );
  const artistIdBySlug = new Map(
    Object.values(artistsBySlugMap).map((ctx) => [ctx.artist.slug, ctx.artist.id]),
  );

  const acts = parseConcertActs(actRows, row.id, artistIdBySlug);
  const flatSetlist = setlistRows.map((s) => s.songTitle);
  const videos: Record<string, string> = {};
  for (const v of videoRows) videos[v.songTitle] = v.url;

  const concert = mapConcertRow(row, {
    setlist: flatSetlist.length ? flatSetlist : acts.flatMap((a) => a.setlist),
    acts: acts.length ? acts : undefined,
    videos,
    reviews: reviewRows.map(({ title, url, source }) => ({ title, url, source })),
    recordings: recordingRows.map(({ title, url, duration }) => ({ title, url, duration })),
    artistSlug: row.artistSlug,
    artistName: row.artistName,
  });

  return {
    concert,
    artist: { id: row.artistId, slug: row.artistSlug, name: row.artistName },
    tours: mapToursRows(tourRows),
    songMeta: mapSongMetaRows(metaRows),
    artistsBySlug: artistsBySlugMap,
  };
}

/** First headliner concert UUID for a pseudo-artist (for redirects). */
export async function findPseudoArtistTimelineConcertId(
  artistSlug: string,
): Promise<string | null> {
  const db = getDb();
  const artist = (
    await db.select().from(artists).where(eq(artists.slug, artistSlug)).limit(1)
  )[0];
  if (!artist) return null;
  const rows = await db
    .select({ id: concerts.id, slug: concerts.slug, eventKind: concerts.eventKind })
    .from(concerts)
    .where(eq(concerts.artistId, artist.id))
    .orderBy(sql`${concerts.sortDate} DESC`);
  const multi = rows.find((r) =>
    isTimelineConcert({ id: r.id, slug: r.slug, eventKind: r.eventKind }),
  );
  return multi?.id ?? rows[0]?.id ?? null;
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
  const artistRows = await db.select().from(artists).where(inArray(artists.slug, [...slugs]));
  const artistIds = artistRows.map((a) => a.id);
  const metaRows = artistIds.length
    ? await db.select().from(songMeta).where(inArray(songMeta.artistId, artistIds))
    : [];
  const out: Record<
    string,
    Pick<import("@/types/domain").ArtistContext, "artist" | "songMeta">
  > = {};
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
  const songMetaMap: Record<string, import("@/types/domain").SongMeta> = {};
  for (const m of metaRows) {
    songMetaMap[m.songTitle] = {
      origin: m.origin,
      album: m.album || "",
      year: m.year ?? undefined,
      by: m.coverBy || undefined,
      officialVideo: m.officialVideoUrl || undefined,
    };
  }
  return songMetaMap;
}

function mapToursRows(
  tourRows: { name: string; posterPath: string | null; label: string | null; kind: string | null }[],
): ArtistPayload["tours"] {
  const toursMap: ArtistPayload["tours"] = {};
  for (const t of tourRows) {
    toursMap[t.name] = {
      poster: t.posterPath || "",
      label: t.label || "",
      kind: t.kind || "album",
    };
  }
  return toursMap;
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
        eventKind: concerts.eventKind,
        eventTitle: concerts.eventTitle,
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
  const artistsById: HomePayload["artistsById"] = {};
  for (const a of artistRows) {
    const ctx = {
      artist: { id: a.id, slug: a.slug, name: a.name },
      tours: mapToursRows(tourRows.filter((t) => t.artistId === a.id)),
      songMeta: mapSongMetaRows(metaRows.filter((m) => m.artistId === a.id)),
    };
    artistsBySlug[a.slug] = ctx;
    artistsById[a.id] = ctx;
  }

  const artistIdBySlug = new Map(artistRows.map((a) => [a.slug, a.id]));

  const allConcerts = concertRows.map((c) => {
    const acts = parseConcertActs(actRows, c.id, artistIdBySlug);
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
  const timelineConcerts = visibleConcerts.filter((c) =>
    isTimelineConcert({
      id: c.id,
      slug: c.slug,
      hidden: c.hidden,
      eventKind: c.eventKind,
    }),
  );
  const hiddenConcerts = allConcerts.filter((c) => c.hidden);

  const years = new Set(timelineConcerts.map((c) => c.sort.slice(0, 4)));

  const concertById = new Map(concertRows.map((c) => [c.id, c]));
  const guestActsByArtist = new Map<
    string,
    { parentSlug: string; sortDate: string; hidden: boolean }[]
  >();
  for (const act of actRows) {
    const parent = concertById.get(act.concertId);
    if (!parent) continue;
    const list = guestActsByArtist.get(act.artistSlug) ?? [];
    list.push({
      parentSlug: parent.slug,
      sortDate: parent.sortDate,
      hidden: parent.hidden === true,
    });
    guestActsByArtist.set(act.artistSlug, list);
  }

  const toListRow = (a: (typeof artistRows)[0]) => {
    const headliners = concertRows
      .filter((c) => c.artistId === a.id)
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        sort: c.sortDate,
        hidden: c.hidden,
        eventKind: c.eventKind,
      }));
    return {
      id: a.id,
      slug: a.slug,
      name: a.name,
      image_path: a.imagePath,
      concert_count: countArtistVisibleConcerts(
        a.slug,
        headliners,
        guestActsByArtist.get(a.slug) ?? [],
      ),
      headlinerConcerts: headliners,
    };
  };

  const headlinerArtists = sortArtistsByName(
    filterSoloConcertArtists(artistRows.map(toListRow)),
  );
  const festivalGuestArtists = sortArtistsByName(
    filterFestivalGuestArtists(artistRows.map(toListRow)),
  );

  return {
    artists: headlinerArtists,
    festivalGuestArtists,
    artistsBySlug,
    artistsById,
    concerts: timelineConcerts,
    hiddenConcerts,
    stats: {
      concerts: timelineConcerts.length,
      artists: headlinerArtists.length,
      years: years.size,
    },
  };
}
