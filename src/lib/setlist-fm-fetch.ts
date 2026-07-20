const USER_AGENT = "Mozilla/5.0 (compatible; LiveKonzertCompanion/1.0; setlist fetch)";

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

export function parseSetlistFmSongs(html: string): string[] {
  const songs: string[] = [];
  const listMatch = html.match(/<ul class="setlistList">([\s\S]*?)<\/ul>/i);
  const block = listMatch?.[1] ?? html;
  for (const match of block.matchAll(/<li[^>]*class="[^"]*setlistParts[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    const part = match[1];
    const songMatch = part.match(/<div class="songPart[^"]*">([\s\S]*?)<\/div>/i);
    const raw = decodeHtml((songMatch?.[1] ?? part).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (raw && !/^encore:?$/i.test(raw)) songs.push(raw);
  }
  if (songs.length) return songs;

  for (const match of block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const raw = decodeHtml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (raw && raw.length > 1 && !/^encore:?$/i.test(raw)) songs.push(raw);
  }
  return songs;
}

export function extractSetlistLinks(html: string): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  for (const match of html.matchAll(/href="(\/setlist\/[^"]+\.html)"/gi)) {
    const url = `https://www.setlist.fm${match[1]}`;
    if (out.some((x) => x.url === url)) continue;
    out.push({ url, label: match[1] });
  }
  return out;
}

function dateMatchesPage(html: string, isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-");
  const patterns = [
    isoDate,
    `${d}.${m}.${y}`,
    `${Number(d)}.${Number(m)}.${y}`,
    `${y}/${m}/${d}`,
  ];
  return patterns.some((p) => html.includes(p));
}

export async function fetchSetlistFromSetlistFm(input: {
  artistName: string;
  city: string;
  date: string;
  venue?: string;
}): Promise<{ setlistFmUrl: string | null; songs: string[] }> {
  const queries = [
    `${input.artistName} ${input.city} ${input.date}`,
    `${input.artistName} ${input.venue || ""} ${input.city} ${input.date}`.trim(),
    `${input.artistName} ${input.date}`,
  ];

  for (const query of [...new Set(queries)]) {
    const searchUrl = `https://www.setlist.fm/search?query=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(searchUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const links = extractSetlistLinks(html).slice(0, 8);
      for (const link of links) {
        const pageRes = await fetch(link.url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(20000),
        });
        if (!pageRes.ok) continue;
        const pageHtml = await pageRes.text();
        if (!dateMatchesPage(pageHtml, input.date)) continue;
        const songs = parseSetlistFmSongs(pageHtml);
        if (songs.length) return { setlistFmUrl: link.url, songs };
      }
    } catch {
      continue;
    }
  }

  return { setlistFmUrl: null, songs: [] };
}
