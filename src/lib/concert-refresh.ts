export type RefreshSet = {
  actId: string | null;
  artistName: string;
  songs: string[];
  setlistFmUrl: string | null;
  videos: Record<string, string>;
};

export type RefreshReview = { title: string; url: string; source: string };
export type RefreshRecording = { title: string; url: string; duration: string };

export type ConcertRefreshSnapshot = {
  concertId: string;
  /** Detect edits made while the search was running. */
  identity: string;
  sets: RefreshSet[];
  reviews: RefreshReview[];
  recordings: RefreshRecording[];
};

export type ConcertRefreshFindings = {
  setlists: { actId: string | null; songs: string[]; setlistFmUrl: string | null }[];
  videos: { actId: string | null; songTitle: string; url: string }[];
  reviews: RefreshReview[];
  recordings: RefreshRecording[];
};

export type ConcertRefreshProposal = {
  snapshot: ConcertRefreshSnapshot;
  findings: ConcertRefreshFindings;
};

export function sameSongs(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((song, index) => song === b[index]);
}

/** Only propose real changes; empty search results never remove stored data. */
export function concertRefreshChanges({ snapshot, findings }: ConcertRefreshProposal): ConcertRefreshFindings {
  return {
    setlists: findings.setlists.filter((found) => {
      const current = snapshot.sets.find((set) => set.actId === found.actId);
      return current && (
        (found.songs.length > 0 && !sameSongs(current.songs, found.songs)) ||
        (found.setlistFmUrl && found.setlistFmUrl !== current.setlistFmUrl)
      );
    }),
    videos: findings.videos.filter((found, index, all) => {
      const current = snapshot.sets.find((set) => set.actId === found.actId);
      return current && !current.videos[found.songTitle] &&
        all.findIndex((video) => video.actId === found.actId && video.songTitle === found.songTitle) === index;
    }),
    reviews: findings.reviews.filter((found, index, all) =>
      !snapshot.reviews.some((review) => review.url === found.url) &&
      all.findIndex((review) => review.url === found.url) === index,
    ),
    recordings: findings.recordings.filter((found, index, all) =>
      !snapshot.recordings.some((recording) => recording.url === found.url) &&
      all.findIndex((recording) => recording.url === found.url) === index,
    ),
  };
}

export function hasConcertRefreshChanges(changes: ConcertRefreshFindings): boolean {
  return Object.values(changes).some((items) => items.length > 0);
}
