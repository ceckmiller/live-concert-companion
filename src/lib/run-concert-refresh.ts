import {
  getConcertRefreshSnapshot,
  searchConcertRefreshSetlist,
  searchConcertRefreshVideo,
  searchConcertRefreshReviews,
  searchConcertRefreshRecording,
} from "./concert-refresh-actions";
import { concertRefreshChanges, type ConcertRefreshFindings, type ConcertRefreshProposal } from "./concert-refresh";
import type { EnrichmentStepId, EnrichmentStepState } from "./enrichment-progress";

export async function runConcertRefresh(
  concertId: string,
  patchStep: (id: EnrichmentStepId, status: EnrichmentStepState, detail?: string) => void,
  signal?: AbortSignal,
): Promise<{ proposal: ConcertRefreshProposal; warnings: string[] }> {
  const snapshot = await getConcertRefreshSnapshot(concertId);
  signal?.throwIfAborted();
  const findings: ConcertRefreshFindings = { setlists: [], videos: [], reviews: [], recordings: [] };
  const warnings: string[] = [];

  async function attempt<T>(label: string, work: () => Promise<T>, fallback: T): Promise<T> {
    signal?.throwIfAborted();
    try {
      const result = await work();
      signal?.throwIfAborted();
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      warnings.push(`${label}: ${error instanceof Error ? error.message : "Suche fehlgeschlagen"}`);
      return fallback;
    }
  }

  patchStep("setlist", "active");
  for (const set of snapshot.sets) {
    patchStep("setlist", "active", set.artistName);
    const found = await attempt(`Setlist (${set.artistName})`, () => searchConcertRefreshSetlist(concertId, set.actId), null);
    if (found) findings.setlists.push({ actId: set.actId, ...found });
  }
  const setlistChanges = concertRefreshChanges({ snapshot, findings }).setlists.length;
  patchStep("setlist", "done", setlistChanges ? `${setlistChanges} neue oder geänderte Setlist(s)` : "Keine Änderungen gefunden");

  patchStep("videos", "active");
  const missing = snapshot.sets.flatMap((set) => {
    const fetched = findings.setlists.find((list) => list.actId === set.actId);
    const songs = fetched?.songs.length ? fetched.songs : set.songs;
    return [...new Set(songs)].filter((song) => !set.videos[song]).map((song) => ({ set, song }));
  });
  for (const [index, { set, song }] of missing.entries()) {
    patchStep("videos", "active", `${index + 1}/${missing.length}: ${song}`);
    const url = await attempt(`Video (${song})`, () => searchConcertRefreshVideo(concertId, set.actId, song), null);
    if (url) findings.videos.push({ actId: set.actId, songTitle: song, url });
  }
  patchStep("videos", "done", `${findings.videos.length} neue Videos`);

  patchStep("reviews", "active");
  findings.reviews = await attempt("Konzertkritiken", () => searchConcertRefreshReviews(concertId), []);
  patchStep("reviews", "done", `${concertRefreshChanges({ snapshot, findings }).reviews.length} neue Kritiken`);

  patchStep("recordings", "active");
  const recording = await attempt("Längere Mitschnitte", () => searchConcertRefreshRecording(concertId), null);
  if (recording) findings.recordings.push(recording);
  patchStep("recordings", "done", `${concertRefreshChanges({ snapshot, findings }).recordings.length} neue Mitschnitte`);
  patchStep("done", "done", "Vorschau bereit");
  return { proposal: { snapshot, findings }, warnings };
}
