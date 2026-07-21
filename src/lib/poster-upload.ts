export const POSTER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const POSTER_UPLOAD_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export function isAllowedPosterUpload(mime: string, size: number): boolean {
  return (
    POSTER_UPLOAD_MIMES.includes(mime as (typeof POSTER_UPLOAD_MIMES)[number]) &&
    size > 0 &&
    size <= POSTER_UPLOAD_MAX_BYTES
  );
}

export function posterUploadExtension(mime: string, filename: string): string {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  const ext = filename.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/)?.[0];
  if (ext === ".jpeg") return ".jpg";
  return ext || ".jpg";
}

export function posterTitleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || "Hochgeladenes Plakat";
}

type UploadBlob = Blob & { name?: string; type?: string; size?: number };

export async function readPosterUploadFromFormData(formData: FormData): Promise<{
  name: string;
  type: string;
  size: number;
  buffer: Buffer;
}> {
  const raw = formData.get("file");
  if (!raw || typeof raw !== "object" || typeof (raw as UploadBlob).arrayBuffer !== "function") {
    throw new Error("Keine Datei ausgewählt");
  }
  const file = raw as UploadBlob;
  const name = typeof file.name === "string" && file.name.trim() ? file.name : "upload.jpg";
  const type = typeof file.type === "string" && file.type ? file.type : "image/jpeg";
  const size = typeof file.size === "number" ? file.size : 0;
  if (!isAllowedPosterUpload(type, size)) {
    throw new Error("Ungültiges Bild (JPG, PNG, WebP oder GIF, max. 10 MB)");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return { name, type, size, buffer };
}

export function isValidPosterPath(value: string): boolean {
  const path = value.trim();
  return (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("/posters/") ||
    path.startsWith("/api/posters/")
  );
}

export function parsePosterUploadFilename(filename: string): string | null {
  const match = filename.match(/^([0-9a-f-]{36})\.(jpe?g|png|webp|gif)$/i);
  return match?.[1] ?? null;
}

export function isBlobPosterUrl(value: string): boolean {
  return value.trim().startsWith("blob:");
}

export function resolvePosterLabel(input: {
  posterTitle?: string;
  tourName: string;
  posterUrl: string;
  existingPosterPath: string | null;
  existingPosterLabel: string | null;
}): string {
  const rawTitle = input.posterTitle?.trim();
  const samePoster = input.posterUrl === input.existingPosterPath;
  if (samePoster && input.existingPosterLabel && (!rawTitle || rawTitle === "Aktuelles Plakat")) {
    return input.existingPosterLabel;
  }
  if (rawTitle) return `Tourplakat: ${rawTitle}`;
  return `Tourplakat: ${input.tourName}`;
}
