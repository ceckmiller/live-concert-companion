import { eq } from "drizzle-orm";
import { ensureDbInitialized } from "./init-db";
import { getDb } from "./db";
import { posterUploads } from "./db/schema";
import { posterTitleFromFilename, posterUploadExtension } from "./poster-upload";

export function posterUploadPublicPath(id: string, ext: string): string {
  return `/api/posters/${id}${ext}`;
}

export async function savePosterUploadToDb(
  data: Buffer,
  mime: string,
  filename: string,
): Promise<{ url: string; title: string }> {
  await ensureDbInitialized();
  const id = crypto.randomUUID();
  const ext = posterUploadExtension(mime, filename);
  const db = getDb();
  await db.insert(posterUploads).values({
    id,
    mimeType: mime,
    dataBase64: data.toString("base64"),
    createdAt: new Date().toISOString(),
  });
  return {
    url: posterUploadPublicPath(id, ext),
    title: posterTitleFromFilename(filename),
  };
}

export async function loadPosterUpload(id: string): Promise<{ mime: string; data: Buffer } | null> {
  const db = getDb();
  const row = (
    await db.select().from(posterUploads).where(eq(posterUploads.id, id)).limit(1)
  )[0];
  if (!row) return null;
  return { mime: row.mimeType, data: Buffer.from(row.dataBase64, "base64") };
}
