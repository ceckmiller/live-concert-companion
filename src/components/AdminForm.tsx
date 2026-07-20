"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createConcert,
  enrichConcertPoster,
  enrichConcertRecordings,
  enrichConcertSetlist,
  enrichConcertVideoSong,
  listConcertSongsMissingVideos,
} from "@/lib/actions";
import { EnrichmentProgress } from "@/components/EnrichmentProgress";
import { TourPosterEditModal, type PosterPick } from "@/components/TourPosterEditModal";
import { PosterCropFrame } from "@/components/PosterCropFrame";
import {
  initialEnrichmentSteps,
  setStepStatus,
  type EnrichmentStep,
} from "@/lib/enrichment-progress";

export function AdminForm() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<EnrichmentStep[] | null>(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const [posterPick, setPosterPick] = useState<PosterPick | null>(null);
  const [draft, setDraft] = useState({
    artistName: "",
    tourName: "",
    city: "Berlin",
    date: "",
  });

  function patchStep(id: EnrichmentStep["id"], status: EnrichmentStep["status"], detail?: string) {
    setSteps((current) => (current ? setStepStatus(current, id, status, detail) : current));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setLink("");
    const form = e.currentTarget;
    const fd = new FormData(form);
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

      patchStep("setlist", "active");
      const setlist = await enrichConcertSetlist(res.artistSlug, res.concertSlug);
      patchStep(
        "setlist",
        setlist.songsFound ? "done" : "error",
        setlist.songsFound
          ? `${setlist.songsFound} Songs`
          : "Keine Setlist auf setlist.fm gefunden",
      );

      if (!skipPoster) {
        if (res.hadPosterFromForm) {
          patchStep("poster", "done", "Plakat gewählt");
        } else {
          patchStep("poster", "active");
          const poster = await enrichConcertPoster(res.artistSlug, res.concertSlug);
          patchStep(
            "poster",
            poster.posterFound ? "done" : "error",
            poster.posterFound ? "Tourplakat gefunden" : "Kein Tourplakat gefunden — Fotobibliothek nutzen",
          );
        }
      }

      patchStep("videos", "active");
      const { missing } = await listConcertSongsMissingVideos(res.artistSlug, res.concertSlug);
      let videosFound = 0;
      if (!missing.length) {
        patchStep("videos", setlist.songsFound ? "skipped" : "error", "Keine Songs für Videos");
      } else {
        for (let i = 0; i < missing.length; i++) {
          const song = missing[i];
          patchStep("videos", "active", `${i + 1}/${missing.length}: ${song}`);
          const hit = await enrichConcertVideoSong(res.artistSlug, res.concertSlug, song);
          if (hit.found) videosFound++;
        }
        patchStep(
          "videos",
          videosFound ? "done" : "error",
          `${videosFound}/${missing.length} YouTube-Videos`,
        );
      }

      patchStep("recordings", "active");
      const recordings = await enrichConcertRecordings(res.artistSlug, res.concertSlug);
      patchStep(
        "recordings",
        recordings.recordingsFound ? "done" : "error",
        recordings.recordingsFound
          ? `${recordings.recordingsFound} Mitschnitt(e)`
          : "Kein längerer Mitschnitt gefunden",
      );

      patchStep("done", "done");
      setMsg(`Konzert angelegt: ${res.weekdayTime}.`);
      setLink(res.artistSlug);
      setPosterPick(null);
      form.reset();
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
            Künstler und Datum reichen — Setlist, Tourplakat, YouTube-Videos und Mitschnitte werden automatisch
            gesucht.
          </p>
        </div>
        <form
          className="admin-form"
          onSubmit={onSubmit}
          onChange={(e) => syncDraft(e.currentTarget)}
        >
          <label>
            Künstler
            <input name="artistName" required placeholder="z. B. Placebo" disabled={busy} />
          </label>
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
            {busy ? "Anlegen & anreichern …" : "Konzert anlegen"}
          </button>
        </form>
        {steps ? <EnrichmentProgress steps={steps} /> : null}
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
