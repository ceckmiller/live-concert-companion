"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createConcert } from "@/lib/actions";
import { EnrichmentProgress } from "@/components/EnrichmentProgress";
import { TourPosterEditModal, type PosterPick } from "@/components/TourPosterEditModal";
import { PosterCropFrame } from "@/components/PosterCropFrame";
import {
  initialEnrichmentSteps,
  setStepStatus,
  type EnrichmentStep,
} from "@/lib/enrichment-progress";
import { runConcertInternetEnrichment } from "@/lib/run-concert-enrichment";

export function AdminForm() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<EnrichmentStep[] | null>(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const [posterPick, setPosterPick] = useState<PosterPick | null>(null);
  const [multiAct, setMultiAct] = useState(false);
  const [draft, setDraft] = useState({
    artistName: "",
    tourName: "",
    city: "Berlin",
    date: "",
  });

  function patchStep(
    id: EnrichmentStep["id"],
    status: EnrichmentStep["status"],
    detail?: string,
  ) {
    setSteps((current) => (current ? setStepStatus(current, id, status, detail) : current));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setLink("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (multiAct) fd.set("multiAct", "true");
    if (posterPick) {
      fd.set("posterUrl", posterPick.url);
      fd.set("posterTitle", posterPick.title);
      if (posterPick.crop) {
        fd.set("posterCropJson", JSON.stringify(posterPick.crop));
      }
    }

    const skipPoster = Boolean(posterPick?.url);
    setSteps(initialEnrichmentSteps(skipPoster));
    setBusy(true);

    try {
      patchStep("save", "active");
      const res = await createConcert(fd);
      patchStep("save", "done");

      await runConcertInternetEnrichment(
        { artistSlug: res.artistSlug, concertSlug: res.concertSlug },
        {
          includePoster: !skipPoster,
          hadPosterFromForm: res.hadPosterFromForm,
          patchStep,
        },
      );

      setMsg(
        multiAct
          ? `Multi-Act-Event angelegt: ${res.weekdayTime}. Fehlende Online-Daten kannst du später nachziehen.`
          : `Konzert angelegt: ${res.weekdayTime}. Fehlende Online-Daten (z. B. Setlist) kannst du später nachziehen.`,
      );
      setLink(res.concertId);
      setPosterPick(null);
      form.reset();
      setMultiAct(false);
      setDraft({ artistName: "", tourName: "", city: "Berlin", date: "" });
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setBusy(false);
    }
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
            Künstler bzw. Event-Name und Datum reichen — Setlist, Tourplakat, YouTube-Videos, Kritiken und
            Mitschnitte werden automatisch gesucht.
          </p>
        </div>
        <form
          className="admin-form"
          onSubmit={onSubmit}
          onChange={(e) => syncDraft(e.currentTarget)}
        >
          <label className="admin-check">
            <input
              type="checkbox"
              checked={multiAct}
              onChange={(e) => setMultiAct(e.target.checked)}
              disabled={busy}
            />
            <span>Multi-Act-Event (Festival / mehrere Acts)</span>
          </label>
          <label>
            {multiAct ? "Event-Name" : "Künstler"}
            <input
              name="artistName"
              required
              placeholder={multiAct ? "z. B. Peace x Peace" : "z. B. Placebo"}
              disabled={busy}
            />
          </label>
          {multiAct ? (
            <p className="admin-hint">
              Das Event erscheint in der Chronologie mit Multi-Act-Badge. Acts kannst du später ergänzen.
            </p>
          ) : null}
          <label>
            Tour (optional)
            <input name="tourName" placeholder="z. B. LIVE 2024" disabled={busy} />
          </label>
          <label>
            Datum
            <input name="date" type="date" required disabled={busy} />
          </label>
          <label>
            Venue (optional)
            <input name="venue" placeholder="Tempodrom" disabled={busy} />
          </label>
          <label>
            Stadt (optional)
            <input name="city" defaultValue="Berlin" placeholder="Berlin" disabled={busy} />
          </label>
          <div className="admin-poster-field">
            <span>Tourplakat (optional)</span>
            <button
              type="button"
              className="admin-poster-btn"
              disabled={busy}
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
                <span className="admin-poster-placeholder">Plakat suchen, aus Fotobibliothek oder wählen</span>
              )}
            </button>
          </div>
          <button type="submit" disabled={busy}>
            {busy
              ? "Anlegen & anreichern …"
              : multiAct
                ? "Multi-Act anlegen"
                : "Konzert anlegen"}
          </button>
        </form>
        {steps ? <EnrichmentProgress steps={steps} /> : null}
        {msg && (
          <p className="admin-msg">
            {msg}
            {link && (
              <>
                {" "}
                — <Link href={`/concert/${link}`}>Zum Konzert</Link>
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
