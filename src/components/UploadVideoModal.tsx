"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { uploadConcertVideoForSong } from "@/lib/actions";
import { isAllowedVideoUpload } from "@/lib/video-upload";

type UploadVideoModalProps = {
  open: boolean;
  onClose: () => void;
  concertId?: string;
  artistSlug: string;
  concertSlug: string;
  songs: string[];
};

export function UploadVideoModal({
  open,
  onClose,
  concertId,
  artistSlug,
  concertSlug,
  songs,
}: UploadVideoModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setSongTitle(songs[0] || "");
    setFile(null);
    setError("");
  }, [open, songs]);

  if (!open) return null;

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (!isAllowedVideoUpload(picked.type, picked.size)) {
      setError("Nur MP4, WebM oder MOV bis 500 MB.");
      setFile(null);
      return;
    }
    setError("");
    setFile(picked);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!songTitle) {
      setError("Bitte einen Song auswählen.");
      return;
    }
    if (!file) {
      setError("Bitte ein Video aus deiner Bibliothek wählen.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const fd = new FormData();
        if (concertId) fd.set("concertId", concertId);
        fd.set("artistSlug", artistSlug);
        fd.set("concertSlug", concertSlug);
        fd.set("songTitle", songTitle);
        fd.set("file", file);
        await uploadConcertVideoForSong(fd);
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload fehlgeschlagen");
      }
    });
  }

  return (
    <div className="poster-modal-backdrop" onClick={onClose}>
      <dialog className="poster-modal upload-video-modal" open onClick={(e) => e.stopPropagation()}>
        <div className="poster-modal-head">
          <h2>Eigenes Video hochladen</h2>
          <button type="button" className="poster-modal-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        {songs.length ? (
          <form className="upload-video-form" onSubmit={onSubmit}>
            <label>
              Song aus der Setlist
              <select value={songTitle} onChange={(e) => setSongTitle(e.target.value)} required>
                {songs.map((song) => (
                  <option key={song} value={song}>
                    {song}
                  </option>
                ))}
              </select>
            </label>
            <div className="poster-modal-upload">
              <span className="poster-modal-upload-label">Video aus Bibliothek</span>
              <button
                type="button"
                className="poster-modal-upload-btn"
                disabled={pending}
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? file.name : "Video wählen …"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="poster-modal-upload-input"
                accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                onChange={onFilePick}
              />
            </div>
            {error ? <p className="poster-modal-error">{error}</p> : null}
            <div className="concert-edit-actions">
              <button type="button" className="poster-modal-upload-btn" onClick={onClose}>
                Abbrechen
              </button>
              <button type="submit" className="poster-modal-search-btn" disabled={pending}>
                {pending ? "Hochladen …" : "Hochladen"}
              </button>
            </div>
          </form>
        ) : (
          <p className="section-desc">
            Noch keine Setlist — zuerst Setlist laden oder Konzert anlegen, dann kannst du Videos zuordnen.
          </p>
        )}
      </dialog>
    </div>
  );
}
