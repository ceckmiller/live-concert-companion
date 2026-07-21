const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 2000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = url;
  });
}

/** Shrink phone photos so Netlify/server actions stay under payload limits. */
export async function preparePosterUploadFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Nur Bilddateien sind erlaubt.");
  }

  const previewUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(previewUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Bildverarbeitung nicht verfügbar");
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.88;
    let blob: Blob | null = null;
    while (quality >= 0.45) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= MAX_UPLOAD_BYTES) break;
      quality -= 0.08;
    }

    if (!blob || blob.size > MAX_UPLOAD_BYTES) {
      throw new Error("Bild ist zu groß — bitte ein kleineres Foto wählen (max. 4 MB).");
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "upload";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

export function posterUploadErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes("Failed to find Server Action")) {
      return "Die Seite ist veraltet — bitte hart neu laden (Tab schließen und neu öffnen) und erneut versuchen.";
    }
    if (err.message.includes("Server Components render")) {
      return "Upload fehlgeschlagen. Bitte Seite hart neu laden und erneut versuchen.";
    }
    return err.message;
  }
  return "Speichern fehlgeschlagen";
}
