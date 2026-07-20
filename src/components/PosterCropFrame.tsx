"use client";

import { useEffect, useMemo, useState } from "react";
import type { PosterCrop } from "@/lib/poster-crop";
import { posterCropLayout, posterCropStageStyle, posterCropStyle } from "@/lib/poster-crop";

export function PosterCropFrame({
  src,
  alt = "",
  crop,
  className,
  title,
}: {
  src: string;
  alt?: string;
  crop?: PosterCrop | null;
  className?: string;
  title?: string;
}) {
  const [loadedSize, setLoadedSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (crop?.imageW && crop?.imageH) {
      setLoadedSize({ width: crop.imageW, height: crop.imageH });
      return;
    }
    setLoadedSize(null);
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      setLoadedSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = src;
  }, [src, crop?.imageW, crop?.imageH]);

  const effectiveCrop = useMemo(() => {
    if (!crop) return null;
    if (crop.imageW && crop.imageH) return crop;
    if (!loadedSize) return crop;
    return { ...crop, imageW: loadedSize.width, imageH: loadedSize.height };
  }, [crop, loadedSize]);

  const layout = effectiveCrop ? posterCropLayout(effectiveCrop) : null;

  return (
    <div
      className={`poster-crop-frame${className ? ` ${className}` : ""}`}
      title={title}
    >
      {layout ? (
        <div className="poster-crop-stage" style={posterCropStageStyle(layout)}>
          <img src={src} alt={alt} draggable={false} />
        </div>
      ) : (
        <img src={src} alt={alt} style={posterCropStyle(crop)} draggable={false} />
      )}
    </div>
  );
}
