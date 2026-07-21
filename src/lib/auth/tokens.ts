import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { getServerEnv } from "../runtime-env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function sessionSecret(): string {
  return getServerEnv("SESSION_SECRET") || "dev-only-session-secret-change-me";
}

/** HMAC-ish fingerprint so cookie tampering is detectable without storing plaintext only. */
export function hashToken(token: string): string {
  return createHash("sha256").update(`${sessionSecret()}:${token}`).digest("hex");
}

export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function appBaseUrl(): string {
  return (getServerEnv("APP_BASE_URL") || "http://localhost:5174").replace(/\/$/, "");
}

export function magicLinkUrl(token: string): string {
  return `${appBaseUrl()}/auth/magic?token=${encodeURIComponent(token)}`;
}
