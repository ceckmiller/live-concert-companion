"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { updateConcert } from "@/lib/actions";

type ConcertEditModalProps = {
  open: boolean;
  onClose: () => void;
  artistSlug: string;
  concertSlug: string;
  artistName: string;
  date: string;
  venue: string;
  city: string;
  tourName: string;
  note?: string;
};

export function ConcertEditModal({
  open,
  onClose,
  artistSlug,
  concertSlug,
  artistName,
  date,
  venue,
  city,
  tourName,
  note,
}: ConcertEditModalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    artistName,
    date,
    venue,
    city,
    tourName,
    note: note || "",
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
    });
    setError("");
  }, [open, artistName, date, venue, city, tourName, note]);

  if (!open) return null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await updateConcert({
          artistSlug,
          concertSlug,
          artistName: form.artistName,
          date: form.date,
          venue: form.venue,
          city: form.city,
          tourName: form.tourName,
          note: form.note,
        });
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  return (
    <div className="poster-modal-backdrop" onClick={onClose}>
      <dialog className="poster-modal concert-edit-modal" open onClick={(e) => e.stopPropagation()}>
        <div className="poster-modal-head">
          <h2>Konzert bearbeiten</h2>
          <button type="button" className="poster-modal-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <form className="concert-edit-form" onSubmit={onSubmit}>
          <label>
            Künstler
            <input
              value={form.artistName}
              onChange={(e) => setForm((f) => ({ ...f, artistName: e.target.value }))}
              required
            />
          </label>
          <label>
            Datum
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </label>
          <label>
            Venue
            <input
              value={form.venue}
              onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
            />
          </label>
          <label>
            Stadt
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </label>
          <label>
            Tour
            <input
              value={form.tourName}
              onChange={(e) => setForm((f) => ({ ...f, tourName: e.target.value }))}
            />
          </label>
          <label>
            Notiz
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={3}
            />
          </label>
          {error ? <p className="poster-modal-error">{error}</p> : null}
          <div className="concert-edit-actions">
            <button type="button" className="poster-modal-upload-btn" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="poster-modal-search-btn" disabled={pending}>
              {pending ? "Speichern …" : "Speichern"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
