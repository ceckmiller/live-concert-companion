import type { CSSProperties } from "react";

export type PosterCrop = {
  zoom: number;
  panX: number;
  panY: number;
  imageW?: number;
  imageH?: number;
};

export const POSTER_CROP_REF = { width: 280, height: 374 };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

export function containedImageSize(
  imageW: number,
  imageH: number,
  frameW = POSTER_CROP_REF.width,
  frameH = POSTER_CROP_REF.height,
) {
  if (!imageW || !imageH) {
    return { width: frameW, height: frameH };
  }
  const scale = Math.min(frameW / imageW, frameH / imageH);
  return { width: imageW * scale, height: imageH * scale };
}

export function cropImageSize(crop: PosterCrop) {
  const imageW = crop.imageW ?? 0;
  const imageH = crop.imageH ?? 0;
  if (!imageW || !imageH) return null;
  return { width: imageW, height: imageH };
}

export function normalizePosterCrop(raw: unknown): PosterCrop | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<PosterCrop>;
  if (typeof value.zoom !== "number" || typeof value.panX !== "number" || typeof value.panY !== "number") {
    return null;
  }
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value.zoom));
  const imageW = typeof value.imageW === "number" && value.imageW > 0 ? value.imageW : undefined;
  const imageH = typeof value.imageH === "number" && value.imageH > 0 ? value.imageH : undefined;
  const crop: PosterCrop = { zoom, panX: value.panX, panY: value.panY, imageW, imageH };
  const pan = clampPan({ x: crop.panX, y: crop.panY }, crop);
  return { ...crop, panX: pan.x, panY: pan.y };
}

export function parsePosterCropJson(json: string | null | undefined): PosterCrop | undefined {
  if (!json) return undefined;
  try {
    return normalizePosterCrop(JSON.parse(json)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function maxPanForZoom(
  zoom: number,
  width = POSTER_CROP_REF.width,
  height = POSTER_CROP_REF.height,
  imageSize?: { width: number; height: number } | null,
) {
  if (!imageSize?.width || !imageSize?.height) {
    return {
      x: (width * (zoom - 1)) / 2,
      y: (height * (zoom - 1)) / 2,
    };
  }
  const base = containedImageSize(imageSize.width, imageSize.height, width, height);
  const displayW = base.width * zoom;
  const displayH = base.height * zoom;
  return {
    x: Math.abs(displayW - width) / 2,
    y: Math.abs(displayH - height) / 2,
  };
}

export function clampPan(
  pan: { x: number; y: number },
  crop: PosterCrop,
  width = POSTER_CROP_REF.width,
  height = POSTER_CROP_REF.height,
) {
  const max = maxPanForZoom(crop.zoom, width, height, cropImageSize(crop));
  return {
    x: Math.max(-max.x, Math.min(max.x, pan.x)),
    y: Math.max(-max.y, Math.min(max.y, pan.y)),
  };
}

export function serializePosterCropJson(crop: PosterCrop | null | undefined): string | null {
  if (!crop) return null;
  const normalized = normalizePosterCrop(crop);
  if (!normalized) return null;
  const isDefaultTransform =
    normalized.zoom === 1 && normalized.panX === 0 && normalized.panY === 0;
  const hasContainMeta = Boolean(normalized.imageW && normalized.imageH);
  if (isDefaultTransform && !hasContainMeta) return null;
  return JSON.stringify(normalized);
}

export type PosterCropLayout = {
  width: number;
  height: number;
  panX: number;
  panY: number;
};

export function posterCropLayout(
  crop: PosterCrop,
  frameWidth = POSTER_CROP_REF.width,
  frameHeight = POSTER_CROP_REF.height,
): PosterCropLayout | null {
  const imageSize = cropImageSize(crop);
  if (!imageSize) return null;
  const base = containedImageSize(imageSize.width, imageSize.height, frameWidth, frameHeight);
  const pan = clampPan({ x: crop.panX, y: crop.panY }, crop, frameWidth, frameHeight);
  return {
    width: base.width * crop.zoom,
    height: base.height * crop.zoom,
    panX: pan.x,
    panY: pan.y,
  };
}

export function posterCropStageStyle(
  layout: PosterCropLayout,
  frameWidth = POSTER_CROP_REF.width,
  frameHeight = POSTER_CROP_REF.height,
): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `${(layout.width / frameWidth) * 100}%`,
    height: `${(layout.height / frameHeight) * 100}%`,
    transform: `translate(calc(-50% + ${(layout.panX / frameWidth) * 100}%), calc(-50% + ${(layout.panY / frameHeight) * 100}%))`,
  };
}

export function posterCropEditorStyle(
  crop: PosterCrop,
  frameWidth = POSTER_CROP_REF.width,
  frameHeight = POSTER_CROP_REF.height,
): CSSProperties | null {
  const layout = posterCropLayout(crop, frameWidth, frameHeight);
  if (!layout) return null;
  return posterCropStageStyle(layout, frameWidth, frameHeight);
}

/** Legacy cover-mode transform when image dimensions are unknown. */
export function posterCropStyle(crop: PosterCrop | null | undefined): CSSProperties {
  if (!crop || (crop.zoom === 1 && crop.panX === 0 && crop.panY === 0)) {
    return {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
    };
  }
  const tx = (crop.panX / POSTER_CROP_REF.width) * 100;
  const ty = (crop.panY / POSTER_CROP_REF.height) * 100;
  return {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    transform: `translate(${tx}%, ${ty}%) scale(${crop.zoom})`,
    transformOrigin: "center center",
  };
}
