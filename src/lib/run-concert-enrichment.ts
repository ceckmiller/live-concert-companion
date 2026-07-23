import {
  enrichConcertPoster,
  enrichConcertRecordings,
  enrichConcertReviews,
  enrichConcertSetlist,
  enrichConcertVideoSong,
  listConcertSongsMissingVideos,
} from "@/lib/actions";
import type { EnrichmentStepId, EnrichmentStepState } from "@/lib/enrichment-progress";

type PatchStep = (
  id: EnrichmentStepId,
  status: EnrichmentStepState,
  detail?: string,
) => void;

export type ConcertEnrichmentRef = {
  artistSlug: string;
  concertSlug: string;
};

async function runStep(
  patchStep: PatchStep,
  id: EnrichmentStepId,
  work: () => Promise<{ status: EnrichmentStepState; detail?: string }>,
): Promise<void> {
  patchStep(id, "active");
  try {
    const result = await work();
    patchStep(id, result.status, result.detail);
  } catch (err) {
    patchStep(
      id,
      "skipped",
      err instanceof Error ? err.message : "Schritt fehlgeschlagen — später erneut versuchen",
    );
  }
}

/** Shared internet enrichment sequence used by create + refresh. */
export async function runConcertInternetEnrichment(
  ref: ConcertEnrichmentRef,
  options: {
    includePoster?: boolean;
    forceRecordings?: boolean;
    hadPosterFromForm?: boolean;
    patchStep: PatchStep;
  },
): Promise<void> {
  const { artistSlug, concertSlug } = ref;
  const { patchStep } = options;

  let songsFound = 0;
  await runStep(patchStep, "setlist", async () => {
    const setlist = await enrichConcertSetlist(artistSlug, concertSlug);
    songsFound = setlist.songsFound;
    return {
      status: setlist.songsFound ? "done" : "skipped",
      detail: setlist.songsFound
        ? `${setlist.songsFound} Songs`
        : "Keine Setlist auf setlist.fm — Konzert ist trotzdem gespeichert",
    };
  });

  if (options.includePoster) {
    if (options.hadPosterFromForm) {
      patchStep("poster", "done", "Plakat gewählt");
    } else {
      await runStep(patchStep, "poster", async () => {
        const poster = await enrichConcertPoster(artistSlug, concertSlug);
        return {
          status: poster.posterFound ? "done" : "skipped",
          detail: poster.posterFound
            ? "Tourplakat gefunden"
            : "Kein Tourplakat gefunden — Fotobibliothek nutzen",
        };
      });
    }
  }

  await runStep(patchStep, "videos", async () => {
    const { missing } = await listConcertSongsMissingVideos(artistSlug, concertSlug);
    if (!missing.length) {
      return {
        status: "skipped",
        detail: songsFound ? "Alle Songs haben schon Videos" : "Keine Songs für Videos",
      };
    }
    let videosFound = 0;
    for (let i = 0; i < missing.length; i++) {
      const song = missing[i];
      patchStep("videos", "active", `${i + 1}/${missing.length}: ${song}`);
      const hit = await enrichConcertVideoSong(artistSlug, concertSlug, song);
      if (hit.found) videosFound++;
    }
    return {
      status: videosFound ? "done" : "skipped",
      detail: `${videosFound}/${missing.length} YouTube-Videos`,
    };
  });

  await runStep(patchStep, "reviews", async () => {
    const reviewResult = await enrichConcertReviews(artistSlug, concertSlug);
    return {
      status: reviewResult.added || reviewResult.reviewsFound ? "done" : "skipped",
      detail: reviewResult.added
        ? `${reviewResult.added} neu (gesamt ${reviewResult.reviewsFound})`
        : reviewResult.reviewsFound
          ? `${reviewResult.reviewsFound} bereits vorhanden`
          : "Keine Kritiken gefunden",
    };
  });

  await runStep(patchStep, "recordings", async () => {
    const recordings = await enrichConcertRecordings(artistSlug, concertSlug, {
      force: options.forceRecordings,
    });
    return {
      status: recordings.recordingsFound ? "done" : "skipped",
      detail: recordings.added
        ? `${recordings.added} neu (gesamt ${recordings.recordingsFound})`
        : recordings.recordingsFound
          ? `${recordings.recordingsFound} bereits vorhanden`
          : "Kein längerer Mitschnitt gefunden",
    };
  });

  patchStep("done", "done");
}
