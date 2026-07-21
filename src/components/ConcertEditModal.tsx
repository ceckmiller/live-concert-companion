"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AttendeePicker, type AttendeeUser } from "@/components/AttendeePicker";
import { EnrichmentProgress } from "@/components/EnrichmentProgress";
import { setConcertAttendees, updateConcert } from "@/lib/actions";
import { getAttendeeEditorStateAction } from "@/lib/auth-actions";
import {
  initialRefreshEnrichmentSteps,
  setStepStatus,
  type EnrichmentStep,
} from "@/lib/enrichment-progress";
import { runConcertInternetEnrichment } from "@/lib/run-concert-enrichment";

type ConcertEditModalProps = {
  open: boolean;
  onClose: () => void;
  concertId: string;
  artistSlug?: string;
  concertSlug?: string;
  artistName: string;
  date: string;
  venue: string;
  city: string;
  tourName: string;
  note?: string;
  isFestivalEvent?: boolean;
};

export function ConcertEditModal({
  open,
  onClose,
  concertId,
  artistSlug,
  concertSlug,
  artistName,
  date,
  venue,
  city,
  tourName,
  note,
  isFestivalEvent = false,
}: ConcertEditModalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<EnrichmentStep[] | null>(null);
  const [people, setPeople] = useState<AttendeeUser[]>([]);
  const [attendees, setAttendees] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState("");
  const [form, setForm] = useState({
    artistName,
    date,
    venue,
    city,
    tourName,
    note: note || "",
    multiAct: isFestivalEvent,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      artistName,
      date,
      venue,
      city,
      tourName,
      note: note || "",
      multiAct: isFestivalEvent,
    });
    setError("");
    setSteps(null);
    setEnriching(false);
    let cancelled = false;
    getAttendeeEditorStateAction(concertId)
      .then((state) => {
        if (cancelled) return;
        setPeople(state.users);
        setAttendees(new Set(state.selectedIds));
        setCurrentUserId(state.currentUserId);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, artistName, date, venue, city, tourName, note, isFestivalEvent, concertId]);

  if (!open) return null;

  const busy = pending || enriching;
  const canRefresh = Boolean(artistSlug && concertSlug);

  function patchStep(
    id: EnrichmentStep["id"],
    status: EnrichmentStep["status"],
    detail?: string,
  ) {
    setSteps((current) => (current ? setStepStatus(current, id, status, detail) : current));
  }

  function toggleAttendee(id: string) {
    if (id === currentUserId) return;
    setAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        const result = await updateConcert({
          concertId,
          artistSlug,
          concertSlug,
          artistName: form.artistName,
          date: form.date,
          venue: form.venue,
          city: form.city,
          tourName: form.tourName,
          note: form.note,
          multiAct: form.multiAct,
        });
        await setConcertAttendees(result.concertId, [...attendees]);
        onClose();
        if (form.multiAct) {
          router.replace(`/concert/${result.concertId}`);
          router.refresh();
        } else {
          router.replace(`/artist/${result.artistId}#concert-${result.concertId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  async function onRefreshFromInternet() {
    if (!artistSlug || !concertSlug || enriching) return;
    setError("");
    setSteps(initialRefreshEnrichmentSteps());
    setEnriching(true);
    try {
      await runConcertInternetEnrichment(
        { artistSlug, concertSlug },
        { forceRecordings: true, patchStep },
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktualisieren fehlgeschlagen");
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div className="poster-modal-backdrop" onClick={enriching ? undefined : onClose}>
      <dialog className="poster-modal concert-edit-modal" open onClick={(e) => e.stopPropagation()}>
        <div className="poster-modal-head">
          <h2>{form.multiAct ? "Multi-Act bearbeiten" : "Konzert bearbeiten"}</h2>
          <button
            type="button"
            className="poster-modal-close"
            onClick={onClose}
            aria-label="Schließen"
            disabled={enriching}
          >
            ×
          </button>
        </div>
        <form className="concert-edit-form" onSubmit={onSubmit}>
          <label className="concert-edit-check">
            <input
              type="checkbox"
              checked={form.multiAct}
              onChange={(e) => setForm((f) => ({ ...f, multiAct: e.target.checked }))}
              disabled={busy}
            />
            <span>Multi-Act-Event (Festival / mehrere Acts)</span>
          </label>
          <label>
            {form.multiAct ? "Event-Name" : "Künstler"}
            <input
              value={form.artistName}
              onChange={(e) => setForm((f) => ({ ...f, artistName: e.target.value }))}
              required
              disabled={busy}
            />
          </label>
          {form.multiAct ? (
            <p className="concert-edit-hint">
              Als Multi-Act erscheint das Event in der Chronologie mit Badge. Der Event-Name ist unabhängig
              vom Künstler-Slug.
            </p>
          ) : null}
          <label>
            Datum
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
              disabled={busy}
            />
          </label>
          <label>
            Venue
            <input
              value={form.venue}
              onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
              disabled={busy}
            />
          </label>
          <label>
            Stadt
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              disabled={busy}
            />
          </label>
          <label>
            Tour
            <input
              value={form.tourName}
              onChange={(e) => setForm((f) => ({ ...f, tourName: e.target.value }))}
              disabled={busy}
            />
          </label>
          <label>
            Notiz
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={3}
              disabled={busy}
            />
          </label>

          <div className="concert-edit-attendees">
            <span className="body-label">Wer war dabei?</span>
            <p className="concert-edit-hint">
              Mit dabei markieren — das Konzert erscheint in deren Chronologie.
            </p>
            <AttendeePicker
              users={people}
              selected={attendees}
              currentUserId={currentUserId}
              disabled={busy}
              onToggle={toggleAttendee}
            />
          </div>

          <div className="concert-edit-refresh">
            <button
              type="button"
              className="concert-edit-refresh-btn"
              onClick={onRefreshFromInternet}
              disabled={!canRefresh || busy}
            >
              {enriching ? "Daten werden abgerufen …" : "Daten aus dem Internet erneut abrufen"}
            </button>
            <p className="concert-edit-hint">
              Setlist, YouTube-Videos, Konzertkritiken und längere Mitschnitte nacheinander suchen.
            </p>
          </div>

          {steps ? <EnrichmentProgress steps={steps} /> : null}
          {error ? <p className="poster-modal-error">{error}</p> : null}
          <div className="concert-edit-actions">
            <button
              type="button"
              className="poster-modal-upload-btn"
              onClick={onClose}
              disabled={enriching}
            >
              {enriching ? "Läuft …" : "Abbrechen"}
            </button>
            <button type="submit" className="poster-modal-search-btn" disabled={busy}>
              {pending ? "Speichern …" : "Speichern"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
