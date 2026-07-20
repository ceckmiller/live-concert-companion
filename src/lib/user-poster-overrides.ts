import fs from "fs";
import path from "path";
import { hasWritableAppDataDir } from "./runtime-env";

export type UserPosterOverride = {
  posterPath: string;
  posterLabel?: string;
  posterCropJson?: string | null;
};

function overridesFile() {
  return path.join(process.cwd(), "data/user-poster-overrides.json");
}

export function loadUserPosterOverrides(): Record<string, UserPosterOverride> {
  const file = overridesFile();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, UserPosterOverride>;
  } catch {
    return {};
  }
}

export function saveUserPosterOverride(concertSlug: string, override: UserPosterOverride): void {
  if (!hasWritableAppDataDir()) return;

  const file = overridesFile();
  const current = loadUserPosterOverrides();
  current[concertSlug] = override;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
  } catch {
    // Production DB is the source of truth; JSON overrides are for local re-seed only.
  }
}

export function applyUserPosterOverride(
  concertSlug: string,
  defaults: { posterPath: string | null; posterLabel: string | null; posterCropJson?: string | null },
): { posterPath: string | null; posterLabel: string | null; posterCropJson: string | null } {
  const override = loadUserPosterOverrides()[concertSlug];
  if (!override) {
    return {
      posterPath: defaults.posterPath,
      posterLabel: defaults.posterLabel,
      posterCropJson: defaults.posterCropJson ?? null,
    };
  }
  return {
    posterPath: override.posterPath,
    posterLabel: override.posterLabel ?? defaults.posterLabel,
    posterCropJson: override.posterCropJson ?? null,
  };
}
