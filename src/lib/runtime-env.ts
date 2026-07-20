/** Server env lookup that stays runtime-only (not inlined at build time). */
export function getServerEnv(name: string): string | undefined {
  return process.env[name];
}

/** Netlify/Vercel serverless: no persistent local filesystem for uploads. */
export function hasWritableAppDataDir(): boolean {
  return getServerEnv("NETLIFY") !== "true" && getServerEnv("VERCEL") !== "1";
}
