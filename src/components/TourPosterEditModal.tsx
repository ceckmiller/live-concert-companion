"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { searchConcertPosters, uploadConcertPosterFile, type PosterCandidate } from "@/lib/actions";
import type { PosterCrop } from "@/lib/poster-crop";
import { defaultPosterSearchQuery } from "@/lib/poster-search-query";
import {
  isAllowedPosterUpload,
  posterTitleFromFilename,
} from "@/lib/poster-upload";
import { TourPosterCropEditor } from "@/components/TourPosterCropEditor";

export type PosterPick = { url: string; title: string; crop?: PosterCrop };

type TourPosterEditModalProps = {
  open: boolean;
  onClose: () => void;
  artistName: string;
  tourName: string;
  city: string;
  year: string;
  currentPoster?: string;
  currentCrop?: PosterCrop | null;
  onPick: (pick: PosterPick) => void | Promise<void>;
};

type Step = "search" | "crop";

export function TourPosterEditModal({
  open,
  onClose,
  artistName,
  tourName,
  city,
  year,
  currentPoster,
  currentCrop,
  onPick,
}: TourPosterEditModalProps) {
  const [step, setStep] = useState<Step>("search");
  const [results, setResults] = useState<PosterCandidate[]>([]);
  const [selected, setSelected] = useState<PosterCandidate | null>(null);
  const [cropInitial, setCropInitial] = useState<PosterCrop | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [savingUrl, setSavingUrl] = useState("");
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const runSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setError("Bitte Suchbegriffe eingeben.");
        setResults([]);
        return;
      }
      setError("");
      startTransition(async () => {
        try {
          const hits = await searchConcertPosters({
            artistName,
            tourName,
            city,
            year,
            searchQuery: trimmed,
          });
          setResults(hits);
          if (!hits.length) setError("Keine passenden Plakate gefunden.");
        } catch (err) {
          setResults([]);
          setError(err instanceof Error ? err.message : "Suche fehlgeschlagen");
        }
      });
    },
    [artistName, tourName, city, year],
  );

  useEffect(() => {
    if (!open) return;
    setStep("search");
    setSelected(null);
    setCropInitial(null);
    setUploadFile(null);
    revokePreview();
    setError("");
    setResults([]);
    const defaultQuery = defaultPosterSearchQuery(artistName, tourName, city, year);
    setSearchQuery(defaultQuery);
    runSearch(defaultQuery);
  }, [open, artistName, tourName, city, year, runSearch, revokePreview]);

  useEffect(() => {
    if (open) return;
    revokePreview();
  }, [open, revokePreview]);

  if (!open) return null;

  function openCrop(candidate: PosterCandidate, initialCrop: PosterCrop | null = null) {
    setSelected(candidate);
    setCropInitial(initialCrop);
    setStep("crop");
    setError("");
  }

  function adjustCurrentCrop() {
    if (!currentPoster) return;
    setUploadFile(null);
    openCrop(
      { url: currentPoster, title: "Aktuelles Plakat", width: 0, height: 0, score: 0 },
      currentCrop ?? null,
    );
  }

  function onLocalFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isAllowedPosterUpload(file.type, file.size)) {
      setError("Nur JPG, PNG, WebP oder GIF bis 10 MB.");
      return;
    }
    revokePreview();
    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setUploadFile(file);
    openCrop(
      {
        url: objectUrl,
        title: posterTitleFromFilename(file.name),
        width: 0,
        height: 0,
        score: 0,
      },
      null,
    );
  }

  function confirmCrop(crop: PosterCrop) {
    if (!selected) return;
    setSavingUrl(selected.url);
    startTransition(async () => {
      try {
        let url = selected.url;
        let title = selected.title;
        if (uploadFile) {
          const fd = new FormData();
          fd.set("file", uploadFile);
          const uploaded = await uploadConcertPosterFile(fd);
          url = uploaded.url;
          title = uploaded.title;
        }
        await onPick({ url, title, crop });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      } finally {
        setSavingUrl("");
      }
    });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    runSearch(searchQuery);
  }

  return (
    <div className="poster-modal-backdrop" onClick={onClose}>
      <dialog className="poster-modal" open onClick={(e) => e.stopPropagation()}>
        <div className="poster-modal-head">
          <h2>{step === "crop" ? "Ausschnitt wählen" : "Tourplakat wählen"}</h2>
          <button type="button" className="poster-modal-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        {step === "search" ? (
          <>
            <form className="poster-modal-search" onSubmit={submitSearch}>
              <label className="poster-modal-search-label">
                Suchbegriffe
                <input
                  type="text"
                  className="poster-modal-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="z. B. Peter Fox LIVE 2023 Berlin Tourplakat"
                />
              </label>
              <button type="submit" className="poster-modal-search-btn" disabled={pending}>
                {pending ? "Suche …" : "Suchen"}
              </button>
            </form>
            <div className="poster-modal-upload">
              <span className="poster-modal-upload-label">oder aus Fotobibliothek</span>
              <button
                type="button"
                className="poster-modal-upload-btn"
                disabled={!!savingUrl}
                onClick={() => fileInputRef.current?.click()}
              >
                Foto wählen …
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="poster-modal-upload-input"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={onLocalFilePick}
              />
            </div>
            {currentPoster ? (
              <div className="poster-modal-current">
                <span>Aktuell</span>
                <img src={currentPoster} alt="" />
                <button type="button" className="poster-crop-adjust" onClick={adjustCurrentCrop}>
                  Ausschnitt anpassen
                </button>
              </div>
            ) : null}
            {pending && !results.length ? <p className="poster-modal-status">Bildersuche läuft …</p> : null}
            {error ? <p className="poster-modal-error">{error}</p> : null}
            <ul className="poster-modal-grid">
              {results.map((hit) => (
                <li key={hit.url}>
                  <button
                    type="button"
                    className="poster-modal-option"
                    disabled={!!savingUrl}
                    onClick={() => {
                      setUploadFile(null);
                      revokePreview();
                      openCrop(hit);
                    }}
                  >
                    <img src={hit.url} alt={hit.title} loading="lazy" />
                    <span className="poster-modal-option-title">{hit.title || "Ohne Titel"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : selected ? (
          <>
            {error ? <p className="poster-modal-error">{error}</p> : null}
            <TourPosterCropEditor
              imageUrl={selected.url}
              imageTitle={selected.title}
              initialCrop={cropInitial}
              onBack={() => {
                setStep("search");
                setUploadFile(null);
                revokePreview();
                setError("");
              }}
              onConfirm={confirmCrop}
            />
          </>
        ) : null}
      </dialog>
    </div>
  );
}
