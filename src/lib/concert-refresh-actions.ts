"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "./auth/session";
import { getDb } from "./db";
import { artists, concerts, concertActs, concertVideos, recordings, reviews, setlistItems } from "./db/schema";
import { findConcertById } from "./concert-lookup";
import { fetchSetlistFromSetlistFm } from "./setlist-fm-fetch";
import {
  concertRefreshChanges,
  type ConcertRefreshProposal,
  type ConcertRefreshSnapshot,
} from "./concert-refresh";

type Reader = Pick<ReturnType<typeof getDb>, "select">;

async function readSnapshot(db: Reader, concertId: string): Promise<ConcertRefreshSnapshot> {
  const [owner] = await db.select({ concert: concerts, artist: artists }).from(concerts)
    .innerJoin(artists, eq(concerts.artistId, artists.id)).where(eq(concerts.id, concertId));
  if (!owner) throw new Error("Konzert nicht gefunden");
  const [songs, videos, acts, reviewRows, recordingRows] = await Promise.all([
    db.select().from(setlistItems).where(eq(setlistItems.concertId, concertId)).orderBy(asc(setlistItems.position)),
    db.select().from(concertVideos).where(eq(concertVideos.concertId, concertId)).orderBy(asc(concertVideos.songTitle)),
    db.select().from(concertActs).where(eq(concertActs.concertId, concertId)).orderBy(asc(concertActs.position), asc(concertActs.id)),
    db.select().from(reviews).where(eq(reviews.concertId, concertId)).orderBy(asc(reviews.id)),
    db.select().from(recordings).where(eq(recordings.concertId, concertId)).orderBy(asc(recordings.id)),
  ]);
  const { concert, artist } = owner;
  return {
    concertId,
    identity: JSON.stringify([artist.id, artist.name, concert.slug, concert.sortDate, concert.city, concert.venue, concert.eventTitle, concert.eventKind]),
    sets: acts.length ? acts.map((act) => ({
      actId: act.id,
      artistName: act.artistName,
      songs: JSON.parse(act.setlistJson) as string[],
      setlistFmUrl: act.setlistFmUrl,
      videos: JSON.parse(act.videosJson) as Record<string, string>,
    })) : [{
      actId: null,
      artistName: concert.eventTitle?.trim() || artist.name,
      songs: songs.map((song) => song.songTitle),
      setlistFmUrl: concert.setlistFmUrl,
      videos: Object.fromEntries(videos.map((video) => [video.songTitle, video.url])),
    }],
    reviews: reviewRows.map(({ title, url, source }) => ({ title, url, source })),
    recordings: recordingRows.map(({ title, url, duration }) => ({ title, url, duration })),
  };
}

export async function getConcertRefreshSnapshot(concertId: string) {
  await requireUser();
  return readSnapshot(getDb(), concertId);
}

async function searchTarget(concertId: string, actId: string | null = null) {
  const db = getDb();
  const { artist, concert } = await findConcertById(db, concertId);
  let artistName = concert.eventTitle?.trim() || artist.name;
  if (actId) {
    const [act] = await db.select().from(concertActs)
      .where(and(eq(concertActs.id, actId), eq(concertActs.concertId, concertId)));
    if (!act) throw new Error("Act für dieses Konzert nicht gefunden");
    artistName = act.artistName;
  }
  return { concert, artistName };
}

/** Search actions only return candidates. Nothing is written before approval. */
export async function searchConcertRefreshSetlist(concertId: string, actId: string | null) {
  await requireUser();
  const { concert, artistName } = await searchTarget(concertId, actId);
  return fetchSetlistFromSetlistFm({ artistName, city: concert.city, date: concert.sortDate, venue: concert.venue });
}

export async function searchConcertRefreshVideo(concertId: string, actId: string | null, song: string) {
  await requireUser();
  const { concert, artistName } = await searchTarget(concertId, actId);
  const { findSongVideo } = await import("../../scripts/search-concert-youtube.mjs");
  return findSongVideo({ concertId: concert.slug, artistName, city: concert.city, venue: concert.venue, sort: concert.sortDate, song });
}

export async function searchConcertRefreshReviews(concertId: string) {
  await requireUser();
  const { concert, artistName } = await searchTarget(concertId);
  const { findConcertReviews } = await import("../../scripts/search-concert-reviews.mjs");
  return findConcertReviews({ artistName, city: concert.city, venue: concert.venue, sort: concert.sortDate });
}

export async function searchConcertRefreshRecording(concertId: string) {
  await requireUser();
  const { concert, artistName } = await searchTarget(concertId);
  const { findConcertRecording } = await import("../../scripts/search-concert-recordings.mjs");
  return findConcertRecording({
    concertId: concert.slug, artistName, city: concert.city, venue: concert.venue, sort: concert.sortDate,
    title: `${artistName} — ${concert.dateLabel}, ${concert.city}`, manual: [],
  });
}

function validateUrl(value: string, setlist = false) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) ||
    (setlist && !["setlist.fm", "www.setlist.fm"].includes(url.hostname))) {
    throw new Error("Ungültiger Link in den Suchergebnissen");
  }
}

export async function applyConcertRefresh(proposal: ConcertRefreshProposal): Promise<void> {
  await requireUser();
  const db = getDb();
  const concertId = proposal.snapshot.concertId;
  await db.transaction(async (tx) => {
    const current = await readSnapshot(tx, concertId);
    if (JSON.stringify(current) !== JSON.stringify(proposal.snapshot)) {
      throw new Error("Die Konzertinformationen wurden inzwischen geändert. Bitte erneut aktualisieren.");
    }
    const changes = concertRefreshChanges(proposal);
    for (const setlist of changes.setlists) {
      if (setlist.setlistFmUrl) validateUrl(setlist.setlistFmUrl, true);
      if (setlist.songs.some((song) => typeof song !== "string" || !song.trim())) {
        throw new Error("Ungültige Setlist");
      }
      if (setlist.actId) {
        await tx.update(concertActs).set({
          ...(setlist.songs.length ? { setlistJson: JSON.stringify(setlist.songs) } : {}),
          ...(setlist.setlistFmUrl ? { setlistFmUrl: setlist.setlistFmUrl } : {}),
        }).where(and(eq(concertActs.id, setlist.actId), eq(concertActs.concertId, concertId)));
      } else {
        if (setlist.songs.length) {
          await tx.delete(setlistItems).where(eq(setlistItems.concertId, concertId));
          await tx.insert(setlistItems).values(setlist.songs.map((songTitle, index) => ({ concertId, position: index + 1, songTitle })));
        }
        if (setlist.setlistFmUrl) {
          await tx.update(concerts).set({ setlistFmUrl: setlist.setlistFmUrl }).where(eq(concerts.id, concertId));
        }
      }
    }
    for (const video of changes.videos) {
      validateUrl(video.url);
      const set = current.sets.find((set) => set.actId === video.actId)!;
      const updatedSetlist = changes.setlists.find((list) => list.actId === video.actId);
      const songs = updatedSetlist?.songs.length ? updatedSetlist.songs : set.songs;
      if (!songs.includes(video.songTitle)) throw new Error("Video gehört nicht zur Setlist");
      if (video.actId) {
        set.videos[video.songTitle] = video.url;
        await tx.update(concertActs).set({ videosJson: JSON.stringify(set.videos) })
          .where(and(eq(concertActs.id, video.actId), eq(concertActs.concertId, concertId)));
      } else {
        await tx.insert(concertVideos).values({ concertId, songTitle: video.songTitle, url: video.url }).onConflictDoNothing();
      }
    }
    for (const review of changes.reviews) {
      validateUrl(review.url);
      await tx.insert(reviews).values({ id: crypto.randomUUID(), concertId, title: review.title, url: review.url, source: review.source });
    }
    for (const recording of changes.recordings) {
      validateUrl(recording.url);
      await tx.insert(recordings).values({ id: crypto.randomUUID(), concertId, title: recording.title, url: recording.url, duration: recording.duration });
    }
  });
  revalidatePath("/", "layout");
}
