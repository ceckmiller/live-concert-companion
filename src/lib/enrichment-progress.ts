export type EnrichmentStepId =
  | "save"
  | "setlist"
  | "poster"
  | "videos"
  | "reviews"
  | "recordings"
  | "done";

export type EnrichmentStepState = "pending" | "active" | "done" | "error" | "skipped";

export type EnrichmentStep = {
  id: EnrichmentStepId;
  label: string;
  status: EnrichmentStepState;
  detail?: string;
};

const STEP_LABELS: Record<EnrichmentStepId, string> = {
  save: "Konzert wird gespeichert …",
  setlist: "Setlist wird auf setlist.fm gesucht …",
  poster: "Tourplakat wird gesucht …",
  videos: "YouTube-Videos werden gesucht …",
  reviews: "Konzertkritiken werden gesucht …",
  recordings: "Längere Mitschnitte werden gesucht …",
  done: "Fertig!",
};

export const ENRICHMENT_STEPS: Omit<EnrichmentStep, "status" | "detail">[] = (
  Object.keys(STEP_LABELS) as EnrichmentStepId[]
).map((id) => ({ id, label: STEP_LABELS[id] }));

function stepsFor(ids: EnrichmentStepId[]): EnrichmentStep[] {
  return ids.map((id) => ({
    id,
    label: STEP_LABELS[id],
    status: "pending" as const,
  }));
}

/** Full create pipeline (optional poster). */
export function initialEnrichmentSteps(skipPoster = false): EnrichmentStep[] {
  const ids: EnrichmentStepId[] = skipPoster
    ? ["save", "setlist", "videos", "reviews", "recordings", "done"]
    : ["save", "setlist", "poster", "videos", "reviews", "recordings", "done"];
  return stepsFor(ids);
}

/** Re-fetch internet data for an existing concert (no save/poster). */
export function initialRefreshEnrichmentSteps(): EnrichmentStep[] {
  return stepsFor(["setlist", "videos", "reviews", "recordings", "done"]);
}

export function setStepStatus(
  steps: EnrichmentStep[],
  id: EnrichmentStepId,
  status: EnrichmentStepState,
  detail?: string,
): EnrichmentStep[] {
  return steps.map((s) => (s.id === id ? { ...s, status, detail: detail ?? s.detail } : s));
}
