import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { applyUserPosterOverride, loadUserPosterOverrides, saveUserPosterOverride } from "./user-poster-overrides";

const originalCwd = process.cwd();
let tempDir = "";

afterEach(() => {
  process.chdir(originalCwd);
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
  delete process.env.NETLIFY;
  delete process.env.TURSO_DATABASE_URL;
});

describe("user poster overrides", () => {
  it("restores uploaded poster paths after seed defaults", () => {
    process.env.TURSO_DATABASE_URL = "file:./local.db";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "poster-overrides-"));
    process.chdir(tempDir);
    fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });

    saveUserPosterOverride("heino-aid-1986-10-18", {
      posterPath: "/posters/uploads/example.jpg",
      posterLabel: "Tourplakat: Heino Aid",
    });

    expect(loadUserPosterOverrides()["heino-aid-1986-10-18"]?.posterPath).toBe("/posters/uploads/example.jpg");
    expect(
      applyUserPosterOverride("heino-aid-1986-10-18", {
        posterPath: "/posters/heino-aid--wir-lassen-uns-das-singen-nicht-verbieten.jpg",
        posterLabel: "Album cover",
      }),
    ).toEqual({
      posterPath: "/posters/uploads/example.jpg",
      posterLabel: "Tourplakat: Heino Aid",
      posterCropJson: null,
    });
  });

  it("skips saving on serverless hosts", () => {
    process.env.TURSO_DATABASE_URL = "libsql://example.turso.io";
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "poster-overrides-"));
    process.chdir(tempDir);
    fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });

    saveUserPosterOverride("test-concert", {
      posterPath: "/posters/uploads/online.jpg",
    });

    expect(loadUserPosterOverrides()).toEqual({});
  });
});
