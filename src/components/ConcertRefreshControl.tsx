"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EnrichmentProgress } from "./EnrichmentProgress";
import { applyConcertRefresh } from "@/lib/concert-refresh-actions";
import {
  concertRefreshChanges,
  hasConcertRefreshChanges,
  sameSongs,
  type ConcertRefreshProposal,
} from "@/lib/concert-refresh";
import { initialRefreshEnrichmentSteps, setStepStatus, type EnrichmentStep } from "@/lib/enrichment-progress";
import { runConcertRefresh } from "@/lib/run-concert-refresh";

export function ConcertRefreshControl({ concertId, title }: { concertId: string; title: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const headingId = useId();
  const [status, setStatus] = useState<"idle" | "searching" | "review" | "saving" | "error">("idle");
  const [steps, setSteps] = useState<EnrichmentStep[]>([]);
  const [proposal, setProposal] = useState<ConcertRefreshProposal | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const open = status !== "idle";
  const changes = proposal ? concertRefreshChanges(proposal) : null;
  const hasChanges = changes && hasConcertRefreshChanges(changes);

  useEffect(() => {
    if (open && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [open]);

  useEffect(() => () => requestRef.current?.abort(), []);

  function close() {
    if (status === "saving") return;
    requestRef.current?.abort();
    dialogRef.current?.close();
    setStatus("idle");
  }

  async function search() {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setProposal(null);
    setWarnings([]);
    setError("");
    setSteps(initialRefreshEnrichmentSteps().map((step) => step.id === "done" ? { ...step, label: "Suche abgeschlossen" } : step));
    setStatus("searching");
    try {
      const result = await runConcertRefresh(concertId, (id, state, detail) => {
        if (!request.signal.aborted) setSteps((current) => setStepStatus(current, id, state, detail));
      }, request.signal);
      if (request.signal.aborted) return;
      setProposal(result.proposal);
      setWarnings(result.warnings);
      setStatus("review");
    } catch (err) {
      if (request.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Aktualisieren fehlgeschlagen");
      setStatus("error");
    }
  }

  async function apply() {
    if (!proposal || status !== "review") return;
    setError("");
    setStatus("saving");
    try {
      await applyConcertRefresh(proposal);
      dialogRef.current?.close();
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Übernehmen fehlgeschlagen");
      setStatus("review");
    }
  }

  return (
    <div className="concert-refresh">
      <button type="button" className="concert-refresh-btn" onClick={search} disabled={open}>
        Informationen für dieses Konzert aktualisieren
      </button>
      {open && createPortal(
        <dialog
          ref={dialogRef}
          className="poster-modal concert-refresh-modal"
          aria-labelledby={headingId}
          onCancel={(event) => { event.preventDefault(); close(); }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
          }}
        >
          <div className="poster-modal-head">
            <h2 id={headingId}>Konzertinformationen aktualisieren</h2>
            <button type="button" className="poster-modal-close" onClick={close} disabled={status === "saving"} aria-label="Schließen">×</button>
          </div>
          <p className="concert-refresh-context">{title}</p>
          {status === "searching" ? (
            <div role="status" aria-live="polite">
              <p>Neue Informationen werden gesucht. Das kann einige Minuten dauern.</p>
              <EnrichmentProgress steps={steps} />
              <p className="concert-refresh-hint">Gespeichert wird erst, wenn du die gefundenen Änderungen übernimmst.</p>
            </div>
          ) : null}
          {changes && proposal ? (
            <div className="concert-refresh-results" aria-live="polite">
              <p>{hasChanges ? "Diese neuen Informationen wurden gefunden. Möchtest du sie übernehmen?" : "Keine neuen Informationen gefunden. Deine Konzertinformationen sind unverändert."}</p>
              {changes.setlists.map((found) => {
                const previous = proposal.snapshot.sets.find((set) => set.actId === found.actId)!;
                const songsChanged = found.songs.length > 0 && !sameSongs(previous.songs, found.songs);
                return (
                  <section className="concert-refresh-result" key={found.actId ?? "solo"}>
                    <h3>{previous.songs.length ? "Aktualisierte Setlist" : "Neue Setlist"}{proposal.snapshot.sets.length > 1 ? ` — ${previous.artistName}` : ""}</h3>
                    {songsChanged ? <>
                      <p className="concert-refresh-hint">Bisher {previous.songs.length} Songs → jetzt {found.songs.length} Songs. Die gefundene Reihenfolge wird übernommen.</p>
                      {previous.songs.length ? <details><summary>Bisherige Setlist anzeigen</summary><ol>{previous.songs.map((song, index) => <li key={index}>{song}</li>)}</ol></details> : null}
                      <ol>{found.songs.map((song, index) => <li key={index}>{song}</li>)}</ol>
                    </> : null}
                    {found.setlistFmUrl ? <a href={found.setlistFmUrl} target="_blank" rel="noopener noreferrer">setlist.fm öffnen</a> : null}
                  </section>
                );
              })}
              {changes.videos.length ? <section className="concert-refresh-result">
                <h3>Neue YouTube-Videos ({changes.videos.length})</h3>
                <ul>{changes.videos.map((video) => <li key={`${video.actId}-${video.songTitle}`}>
                  <a href={video.url} target="_blank" rel="noopener noreferrer">{video.songTitle}</a>
                  {proposal.snapshot.sets.length > 1 ? ` — ${proposal.snapshot.sets.find((set) => set.actId === video.actId)?.artistName}` : ""}
                </li>)}</ul>
              </section> : null}
              {changes.reviews.length ? <section className="concert-refresh-result">
                <h3>Neue Konzertkritiken ({changes.reviews.length})</h3>
                <ul>{changes.reviews.map((review) => <li key={review.url}><a href={review.url} target="_blank" rel="noopener noreferrer">{review.title}</a>{review.source ? ` · ${review.source}` : ""}</li>)}</ul>
              </section> : null}
              {changes.recordings.length ? <section className="concert-refresh-result">
                <h3>Neue längere Mitschnitte ({changes.recordings.length})</h3>
                <ul>{changes.recordings.map((recording) => <li key={recording.url}><a href={recording.url} target="_blank" rel="noopener noreferrer">{recording.title}</a>{recording.duration ? ` (${recording.duration})` : ""}</li>)}</ul>
              </section> : null}
            </div>
          ) : null}
          {warnings.length ? <div className="concert-refresh-warnings" role="status">
            <p>Ein Teil der Suche konnte nicht abgeschlossen werden. Du kannst die übrigen Funde übernehmen oder die Suche wiederholen.</p>
            <ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
          </div> : null}
          {error ? <p className="poster-modal-error" role="alert">{error}</p> : null}
          <div className="concert-refresh-actions">
            <button type="button" className="poster-modal-upload-btn" onClick={close} disabled={status === "saving"}>
              {status === "searching" ? "Suche abbrechen" : hasChanges ? "Nein, verwerfen" : "Schließen"}
            </button>
            {status === "error" || (status === "review" && (warnings.length > 0 || error)) ? <button type="button" className="poster-modal-upload-btn" onClick={search}>Erneut suchen</button> : null}
            {hasChanges ? <button type="button" className="poster-modal-search-btn" onClick={apply} disabled={status !== "review" || Boolean(error)}>
              {status === "saving" ? "Wird übernommen …" : "Ja, übernehmen"}
            </button> : null}
          </div>
        </dialog>, document.body,
      )}
    </div>
  );
}
