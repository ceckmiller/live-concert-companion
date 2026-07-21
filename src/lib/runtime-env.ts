/** Server env lookup that stays runtime-only (not inlined at build time). */
export function getServerEnv(name: string): string | undefined {
  return process.env[name];
}

function usesLocalFileDb(): boolean {
  const url = getServerEnv("TURSO_DATABASE_URL") ?? "file:./local.db";
  return url.startsWith("file:");
}

/** Only local file DB dev can persist uploads under public/. Remote Turso = DB blobs. */
export function hasWritableAppDataDir(): boolean {
  if (!usesLocalFileDb()) return false;
  if (getServerEnv("NETLIFY") === "true") return false;
  if (getServerEnv("VERCEL") === "1") return false;
  if (getServerEnv("AWS_LAMBDA_FUNCTION_NAME")) return false;
  return true;
}
