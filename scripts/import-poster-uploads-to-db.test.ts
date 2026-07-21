import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { importLocalPosterUploads } from "./import-poster-uploads-to-db";

describe("import poster uploads to db", () => {
  it("imports uuid-named files from a directory", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "poster-import-"));
    const uploads = path.join(root, "uploads");
    fs.mkdirSync(uploads, { recursive: true });
    const id = "11111111-2222-4333-8444-555555555555";
    fs.writeFileSync(path.join(uploads, `${id}.jpg`), Buffer.from("fake-jpeg"));

    const prevUrl = process.env.TURSO_DATABASE_URL;
    const prevToken = process.env.TURSO_AUTH_TOKEN;
    process.env.TURSO_DATABASE_URL = `file:${path.join(root, "test.db")}`;
    delete process.env.TURSO_AUTH_TOKEN;

    const result = await importLocalPosterUploads(uploads);
    expect(result.imported).toBe(1);

    process.env.TURSO_DATABASE_URL = prevUrl;
    if (prevToken) process.env.TURSO_AUTH_TOKEN = prevToken;
    else delete process.env.TURSO_AUTH_TOKEN;
    fs.rmSync(root, { recursive: true, force: true });
  });
});
