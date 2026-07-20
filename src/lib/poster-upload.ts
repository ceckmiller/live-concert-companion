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

export function isValidPosterPath(value: string): boolean {
  const path = value.trim();
  return path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/posters/");
}
