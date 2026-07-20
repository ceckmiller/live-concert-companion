import { NextRequest, NextResponse } from "next/server";
import { geniusSearchFallbackUrl, resolveLyricsUrl } from "@/lib/lyrics-url";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const resolved = await resolveLyricsUrl(q);
  const target = resolved ?? geniusSearchFallbackUrl(q);
  return NextResponse.redirect(target, { status: 302 });
}
