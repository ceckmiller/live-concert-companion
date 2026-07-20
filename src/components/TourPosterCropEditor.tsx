"use client";

import { useEffect, useRef, useState } from "react";
import { clampPan, posterCropEditorStyle, type PosterCrop, POSTER_CROP_REF } from "@/lib/poster-crop";

type TourPosterCropEditorProps = {
  imageUrl: string;
  imageTitle?: string;
  initialCrop?: PosterCrop | null;
  onConfirm: (crop: PosterCrop) => void;
  onBack?: () => void;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

export function TourPosterCropEditor({
  imageUrl,
  imageTitle,
  initialCrop,
  onConfirm,
  onBack,
}: TourPosterCropEditorProps) {
  const [zoom, setZoom] = useState(initialCrop?.zoom ?? 1);
  const [pan, setPan] = useState({ x: initialCrop?.panX ?? 0, y: initialCrop?.panY ?? 0 });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(() =>
    initialCrop?.imageW && initialCrop?.imageH
      ? { width: initialCrop.imageW, height: initialCrop.imageH }
      : null,
  );
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    setZoom(initialCrop?.zoom ?? 1);
    setPan({ x: initialCrop?.panX ?? 0, y: initialCrop?.panY ?? 0 });
    if (initialCrop?.imageW && initialCrop?.imageH) {
      setImageSize({ width: initialCrop.imageW, height: initialCrop.imageH });
    } else {
      setImageSize(null);
    }
  }, [imageUrl, initialCrop]);

  useEffect(() => {
    if (imageSize) return;
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [imageUrl, imageSize]);

  const crop: PosterCrop = {
    zoom,
    panX: pan.x,
    panY: pan.y,
    imageW: imageSize?.width,
    imageH: imageSize?.height,
  };

  useEffect(() => {
    if (!imageSize) return;
    setPan((current) =>
      clampPan(current, {
        zoom,
        panX: current.x,
        panY: current.y,
        imageW: imageSize.width,
        imageH: imageSize.height,
      }),
    );
  }, [zoom, imageSize?.width, imageSize?.height]);

  function changeZoom(delta: number) {
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((current + delta) * 10) / 10)));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !imageSize) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !e.currentTarget.hasPointerCapture(e.pointerId) || !imageSize) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan(
      clampPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy }, {
        zoom,
        panX: dragRef.current.panX,
        panY: dragRef.current.panY,
        imageW: imageSize.width,
        imageH: imageSize.height,
      }),
    );
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const stageStyle = imageSize ? posterCropEditorStyle(crop) : null;

  return (
    <div className="poster-crop-editor">
      <p className="poster-crop-editor-hint">
        Plus/Minus zum Zoomen, Bild in alle Richtungen ziehen. Abweichende Seitenverhältnisse bleiben schwarz.
        {imageTitle ? ` — ${imageTitle}` : ""}
      </p>
      <div
        className="poster-crop-viewport"
        style={{ width: POSTER_CROP_REF.width, height: POSTER_CROP_REF.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {stageStyle ? (
          <div className="poster-crop-stage" style={stageStyle}>
            <img
              src={imageUrl}
              alt={imageTitle || "Tourplakat"}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            />
          </div>
        ) : (
          <p className="poster-crop-loading">Bild wird geladen …</p>
        )}
      </div>
      <div className="poster-crop-controls">
        <button
          type="button"
          className="poster-crop-zoom-btn"
          onClick={() => changeZoom(-0.1)}
          disabled={!imageSize}
          aria-label="Verkleinern"
        >
          −
        </button>
        <span className="poster-crop-zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="poster-crop-zoom-btn"
          onClick={() => changeZoom(0.1)}
          disabled={!imageSize}
          aria-label="Vergrößern"
        >
          +
        </button>
      </div>
      <div className="poster-crop-actions">
        {onBack ? (
          <button type="button" className="poster-crop-secondary" onClick={onBack}>
            Zurück
          </button>
        ) : null}
        <button
          type="button"
          className="poster-crop-primary"
          disabled={!imageSize}
          onClick={() => onConfirm(crop)}
        >
          Ausschnitt übernehmen
        </button>
      </div>
    </div>
  );
}
