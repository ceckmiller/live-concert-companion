import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureDbInitialized } from "./init-db";
import { getDb } from "./db";
import { posterUploads } from "./db/schema";
import { loadPosterUpload, savePosterUploadToDb } from "./poster-storage";
import { parsePosterUploadFilename } from "./poster-upload";

describe("poster storage", () => {
  afterEach(async () => {
    const db = getDb();
    await db.delete(posterUploads);
  });

  it(
    "stores uploads in Turso and serves them via /api/posters",
    async () => {
      await ensureDbInitialized();
      const sample = Buffer.from("fake-jpeg-bytes");
      const saved = await savePosterUploadToDb(sample, "image/jpeg", "rennbahn-2021.jpg");
      expect(saved.url).toMatch(/^\/api\/posters\/[0-9a-f-]+\.jpg$/);

      const id = parsePosterUploadFilename(saved.url.replace("/api/posters/", ""));
      expect(id).toBeTruthy();

      const loaded = await loadPosterUpload(id!);
      expect(loaded?.mime).toBe("image/jpeg");
      expect(loaded?.data.equals(sample)).toBe(true);

      const row = (
        await getDb().select().from(posterUploads).where(eq(posterUploads.id, id!)).limit(1)
      )[0];
      expect(row?.mimeType).toBe("image/jpeg");
    },
    30_000,
  );
});
