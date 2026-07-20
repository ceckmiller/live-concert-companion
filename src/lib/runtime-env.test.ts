import { afterEach, describe, expect, it } from "vitest";
import { getServerEnv, hasWritableAppDataDir } from "./runtime-env";

const envKeys = ["NETLIFY", "VERCEL"] as const;

afterEach(() => {
  for (const key of envKeys) delete process.env[key];
});

describe("hasWritableAppDataDir", () => {
  it("returns false on Netlify", () => {
    process.env.NETLIFY = "true";
    expect(hasWritableAppDataDir()).toBe(false);
  });

  it("returns false on Vercel", () => {
    process.env.VERCEL = "1";
    expect(hasWritableAppDataDir()).toBe(false);
  });

  it("returns true locally", () => {
    expect(hasWritableAppDataDir()).toBe(true);
    expect(getServerEnv("NETLIFY")).toBeUndefined();
  });
});
