"use client";

import type { EnrichmentStep } from "@/lib/enrichment-progress";

export function EnrichmentProgress({ steps }: { steps: EnrichmentStep[] }) {
  return (
    <ol className="enrichment-progress" aria-live="polite">
      {steps.map((step) => (
        <li key={step.id} className={`enrichment-step enrichment-step--${step.status}`}>
          <span className="enrichment-step-icon" aria-hidden>
            {step.status === "done" ? "✓" : step.status === "error" ? "!" : step.status === "active" ? "…" : "·"}
          </span>
          <span className="enrichment-step-label">{step.label}</span>
          {step.detail ? <span className="enrichment-step-detail">{step.detail}</span> : null}
        </li>
      ))}
    </ol>
  );
}
