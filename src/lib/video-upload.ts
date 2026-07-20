export const VIDEO_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;
export const VIDEO_UPLOAD_MIMES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"] as const;

export function isAllowedVideoUpload(mime: string, size: number): boolean {
  return (
    VIDEO_UPLOAD_MIMES.includes(mime as (typeof VIDEO_UPLOAD_MIMES)[number]) &&
    size > 0 &&
    size <= VIDEO_UPLOAD_MAX_BYTES
  );
}

export function videoUploadExtension(mime: string, filename: string): string {
  if (mime === "video/mp4" || mime === "video/x-m4v") return ".mp4";
  if (mime === "video/webm") return ".webm";
  if (mime === "video/quicktime") return ".mov";
  const ext = filename.toLowerCase().match(/\.(mp4|webm|mov|m4v)$/)?.[0];
  return ext || ".mp4";
}

export function isValidVideoPath(value: string): boolean {
  const path = value.trim();
  return (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("/videos/") ||
    path.startsWith("/posters/")
  );
}
