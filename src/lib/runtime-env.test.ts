import { afterEach, describe, expect, it } from "vitest";
import { getServerEnv, hasWritableAppDataDir } from "./runtime-env";

const envKeys = ["NETLIFY", "VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "TURSO_DATABASE_URL"] as const;

afterEach(() => {
  for (const key of envKeys) delete process.env[key];
});

describe("hasWritableAppDataDir", () => {
  it("returns false when using remote Turso even without NETLIFY flag", () => {
    process.env.TURSO_DATABASE_URL = "libsql://example.turso.io";
    expect(hasWritableAppDataDir()).toBe(false);
  });

  it("returns false on Netlify", () => {
    process.env.TURSO_DATABASE_URL = "file:./local.db";
    process.env.NETLIFY = "true";
    expect(hasWritableAppDataDir()).toBe(false);
  });

  it("returns false on Vercel", () => {
    process.env.TURSO_DATABASE_URL = "file:./local.db";
    process.env.VERCEL = "1";
    expect(hasWritableAppDataDir()).toBe(false);
  });

  it("returns false on AWS Lambda without explicit platform flag", () => {
    process.env.TURSO_DATABASE_URL = "file:./local.db";
    process.env.AWS_LAMBDA_FUNCTION_NAME = "netlify-handler";
    expect(hasWritableAppDataDir()).toBe(false);
  });

  it("returns true for local file DB dev", () => {
    process.env.TURSO_DATABASE_URL = "file:./local.db";
    expect(hasWritableAppDataDir()).toBe(true);
    expect(getServerEnv("NETLIFY")).toBeUndefined();
  });
});
