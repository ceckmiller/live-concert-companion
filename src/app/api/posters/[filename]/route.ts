import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { loadPosterUpload } from "@/lib/poster-storage";
import { parsePosterUploadFilename } from "@/lib/poster-upload";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> },
) {
  await ensureDbInitialized();
  const { filename } = await context.params;
  const id = parsePosterUploadFilename(filename);
  if (!id) {
    return new NextResponse("Not found", { status: 404 });
  }

  const file = await loadPosterUpload(id);
  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
