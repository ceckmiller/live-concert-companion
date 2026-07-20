export type EnrichmentStepId = "save" | "setlist" | "poster" | "videos" | "recordings" | "done";

export type EnrichmentStepState = "pending" | "active" | "done" | "error" | "skipped";

export type EnrichmentStep = {
  id: EnrichmentStepId;
  label: string;
  status: EnrichmentStepState;
  detail?: string;
};

export const ENRICHMENT_STEPS: Omit<EnrichmentStep, "status" | "detail">[] = [
  { id: "save", label: "Konzert wird gespeichert …" },
  { id: "setlist", label: "Setlist wird auf setlist.fm gesucht …" },
  { id: "poster", label: "Tourplakat wird gesucht …" },
  { id: "videos", label: "YouTube-Videos werden gesucht …" },
  { id: "recordings", label: "Längere Mitschnitte werden gesucht …" },
  { id: "done", label: "Fertig!" },
];

export function initialEnrichmentSteps(skipPoster = false): EnrichmentStep[] {
  return ENRICHMENT_STEPS.filter((s) => !(skipPoster && s.id === "poster")).map((s) => ({
    ...s,
    status: "pending" as const,
  }));
}

export function setStepStatus(
  steps: EnrichmentStep[],
  id: EnrichmentStepId,
  status: EnrichmentStepState,
  detail?: string,
): EnrichmentStep[] {
  return steps.map((s) => (s.id === id ? { ...s, status, detail: detail ?? s.detail } : s));
}
