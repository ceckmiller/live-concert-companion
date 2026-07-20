import type { SongMeta } from "@/types/domain";

const USER_AGENT = "Mozilla/5.0 (compatible; LiveKonzertCompanion/1.0; lyrics redirect)";

export function lyricsSearchQuery(song: string, meta: SongMeta | undefined, artistName: string): string {
  const title = song.replace(/\s*\(cover\)\s*$/i, "").trim();
  const artist = meta?.origin === "cover" && meta.by ? meta.by : artistName;
  return `${artist} ${title}`.trim();
}

/** In-app redirect route — resolves to the first Genius lyrics page on click. */
export function buildLyricsUrl(song: string, meta: SongMeta | undefined, artistName: string): string {
  const q = lyricsSearchQuery(song, meta, artistName);
  return `/api/lyrics?${new URLSearchParams({ q }).toString()}`;
}

export function geniusSearchFallbackUrl(query: string): string {
  return `https://genius.com/search?q=${encodeURIComponent(query)}`;
}

/** Resolve first Genius lyrics URL via DuckDuckGo (site:genius.com). */
export async function resolveLyricsUrl(query: string): Promise<string | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const search = `site:genius.com ${trimmed} lyrics`;
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(search)}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const matches = [...html.matchAll(/uddg=([^&"]+)/g)];
    for (const match of matches) {
      const url = decodeURIComponent(match[1]);
      if (/^https:\/\/genius\.com\/[^/?#]+-lyrics(?:[/?#]|$)/i.test(url)) {
        return url;
      }
    }
  } catch {
    return null;
  }
  return null;
}
