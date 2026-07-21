"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AttendeePicker, type AttendeeUser } from "@/components/AttendeePicker";
import { setConcertAttendees } from "@/lib/actions";

export function ConcertAttendeesPanel({
  concertId,
  users,
  selectedIds,
  currentUserId,
}: {
  concertId: string;
  users: AttendeeUser[];
  selectedIds: string[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(() => new Set(selectedIds));
  const [error, setError] = useState("");

  useEffect(() => {
    setSelected(new Set(selectedIds));
  }, [selectedIds]);

  function toggle(id: string) {
    if (id === currentUserId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    setError("");
    startTransition(async () => {
      try {
        await setConcertAttendees(concertId, [...selected]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      }
    });
  }

  return (
    <section className="attendees-panel">
      <div className="section-head">
        <h2>Wer war dabei?</h2>
        <p className="section-desc">
          Personen hier eintragen — das Konzert erscheint sofort in ihrer Chronologie.
        </p>
      </div>
      <AttendeePicker
        users={users}
        selected={selected}
        currentUserId={currentUserId}
        disabled={pending}
        onToggle={toggle}
      />
      {error ? <p className="poster-modal-error">{error}</p> : null}
      <button type="button" className="page-action-btn" onClick={save} disabled={pending}>
        {pending ? "Speichern …" : "Teilnehmer speichern"}
      </button>
    </section>
  );
}
