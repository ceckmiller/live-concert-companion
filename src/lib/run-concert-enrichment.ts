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

  patchStep("setlist", "active");
  const setlist = await enrichConcertSetlist(artistSlug, concertSlug);
  patchStep(
    "setlist",
    setlist.songsFound ? "done" : "error",
    setlist.songsFound
      ? `${setlist.songsFound} Songs`
      : "Keine Setlist auf setlist.fm gefunden",
  );

  if (options.includePoster) {
    if (options.hadPosterFromForm) {
      patchStep("poster", "done", "Plakat gewählt");
    } else {
      patchStep("poster", "active");
      const poster = await enrichConcertPoster(artistSlug, concertSlug);
      patchStep(
        "poster",
        poster.posterFound ? "done" : "error",
        poster.posterFound
          ? "Tourplakat gefunden"
          : "Kein Tourplakat gefunden — Fotobibliothek nutzen",
      );
    }
  }

  patchStep("videos", "active");
  const { missing } = await listConcertSongsMissingVideos(artistSlug, concertSlug);
  let videosFound = 0;
  if (!missing.length) {
    patchStep(
      "videos",
      setlist.songsFound ? "skipped" : "error",
      setlist.songsFound ? "Alle Songs haben schon Videos" : "Keine Songs für Videos",
    );
  } else {
    for (let i = 0; i < missing.length; i++) {
      const song = missing[i];
      patchStep("videos", "active", `${i + 1}/${missing.length}: ${song}`);
      const hit = await enrichConcertVideoSong(artistSlug, concertSlug, song);
      if (hit.found) videosFound++;
    }
    patchStep(
      "videos",
      videosFound ? "done" : "error",
      `${videosFound}/${missing.length} YouTube-Videos`,
    );
  }

  patchStep("reviews", "active");
  const reviewResult = await enrichConcertReviews(artistSlug, concertSlug);
  patchStep(
    "reviews",
    reviewResult.added || reviewResult.reviewsFound ? "done" : "error",
    reviewResult.added
      ? `${reviewResult.added} neu (gesamt ${reviewResult.reviewsFound})`
      : reviewResult.reviewsFound
        ? `${reviewResult.reviewsFound} bereits vorhanden`
        : "Keine Kritiken gefunden",
  );

  patchStep("recordings", "active");
  const recordings = await enrichConcertRecordings(artistSlug, concertSlug, {
    force: options.forceRecordings,
  });
  patchStep(
    "recordings",
    recordings.recordingsFound ? "done" : "error",
    recordings.added
      ? `${recordings.added} neu (gesamt ${recordings.recordingsFound})`
      : recordings.recordingsFound
        ? `${recordings.recordingsFound} bereits vorhanden`
        : "Kein längerer Mitschnitt gefunden",
  );

  patchStep("done", "done");
}
