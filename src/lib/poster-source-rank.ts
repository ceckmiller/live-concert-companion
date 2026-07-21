/** Prefer durable Turso uploads over catalog/static placeholders when syncing. */
export function posterSourceRank(path: string | null | undefined): number {
  if (!path) return 0;
  if (path.startsWith("/api/posters/")) return 40;
  if (path.includes("/posters/uploads/")) return 30;
  if (/^https?:\/\//i.test(path)) return 20;
  if (path.startsWith("/posters/")) return 10;
  return 5;
}

/**
 * Guard against stale JSON/seed sync wiping live `/api/posters/` uploads.
 * Same path may still update label/crop; different path on an API poster needs force.
 */
export function shouldApplyPosterOverride(
  existingPath: string | null | undefined,
  overridePath: string | null | undefined,
  force = false,
): boolean {
  if (force) return true;
  if (!overridePath) return false;
  if (!existingPath) return true;
  if (existingPath === overridePath) return true;
  if (existingPath.startsWith("/api/posters/")) return false;
  return posterSourceRank(overridePath) >= posterSourceRank(existingPath);
}
