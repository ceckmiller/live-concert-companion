"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createConcert } from "@/lib/actions";
import { TourPosterEditModal, type PosterPick } from "@/components/TourPosterEditModal";
import { PosterCropFrame } from "@/components/PosterCropFrame";

export function AdminForm() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const [pending, startTransition] = useTransition();
  const [posterOpen, setPosterOpen] = useState(false);
  const [posterPick, setPosterPick] = useState<PosterPick | null>(null);
  const [draft, setDraft] = useState({
    artistName: "",
    tourName: "",
    city: "Berlin",
    date: "",
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setLink("");
    const fd = new FormData(e.currentTarget);
    if (posterPick) {
      fd.set("posterUrl", posterPick.url);
      fd.set("posterTitle", posterPick.title);
      if (posterPick.crop) {
        fd.set("posterCropJson", JSON.stringify(posterPick.crop));
      }
    }
    startTransition(async () => {
      try {
        const res = await createConcert(fd);
        setMsg(`Konzert gespeichert: ${res.weekdayTime}`);
        setLink(res.artistSlug);
        setPosterPick(null);
        e.currentTarget.reset();
        setDraft({ artistName: "", tourName: "", city: "Berlin", date: "" });
        router.refresh();
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  }

  function syncDraft(form: HTMLFormElement) {
    setDraft({
      artistName: String(new FormData(form).get("artistName") || ""),
      tourName: String(new FormData(form).get("tourName") || ""),
      city: String(new FormData(form).get("city") || "Berlin"),
      date: String(new FormData(form).get("date") || ""),
    });
  }

  return (
    <main>
      <section>
        <div className="section-head">
          <h2>Konzert hinzufügen</h2>
          <p className="section-desc">
            Künstler und Datum reichen — Ort optional. setlist.fm-Suche wird automatisch hinterlegt.
          </p>
        </div>
        <form
          className="admin-form"
          onSubmit={onSubmit}
          onChange={(e) => syncDraft(e.currentTarget)}
        >
          <label>
            Künstler
            <input name="artistName" required placeholder="z. B. Placebo" />
          </label>
          <label>
            Tour (optional)
            <input name="tourName" placeholder="z. B. LIVE 2024" />
          </label>
          <label>
            Datum
            <input name="date" type="date" required />
          </label>
          <label>
            Venue (optional)
            <input name="venue" defaultValue="Berlin" placeholder="Tempodrom" />
          </label>
          <label>
            Stadt (optional)
            <input name="city" defaultValue="Berlin" placeholder="Berlin" />
          </label>
          <div className="admin-poster-field">
            <span>Tourplakat (optional)</span>
            <button
              type="button"
              className="admin-poster-btn"
              onClick={() => {
                syncDraft(document.querySelector(".admin-form") as HTMLFormElement);
                setPosterOpen(true);
              }}
            >
              {posterPick ? (
                <PosterCropFrame
                  src={posterPick.url}
                  alt={posterPick.title}
                  crop={posterPick.crop}
                  className="admin-poster-preview"
                />
              ) : (
                <span className="admin-poster-placeholder">Plakat suchen, hochladen &amp; wählen</span>
              )}
            </button>
          </div>
          <button type="submit" disabled={pending}>
            {pending ? "Speichern …" : "Konzert anlegen"}
          </button>
        </form>
        {msg && (
          <p className="admin-msg">
            {msg}
            {link && (
              <>
                {" "}
                — <Link href={`/artist/${link}`}>Zur Künstlerseite</Link>
              </>
            )}
          </p>
        )}
      </section>
      <TourPosterEditModal
        open={posterOpen}
        onClose={() => setPosterOpen(false)}
        artistName={draft.artistName}
        tourName={draft.tourName || draft.artistName}
        city={draft.city || "Berlin"}
        year={draft.date.slice(0, 4)}
        currentPoster={posterPick?.url}
        currentCrop={posterPick?.crop}
        onPick={(pick) => {
          setPosterPick(pick);
        }}
      />
    </main>
  );
}
