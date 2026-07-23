const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

/** Songs from r.jina.ai markdown of a setlist.fm page. */
export function parseSetlistFmMarkdownSongs(markdown: string): string[] {
  const songs: string[] = [];
  for (const match of markdown.matchAll(
    /^\s*\d+\.\s+\[([^\]]+)\]\(https?:\/\/(?:www\.)?setlist\.fm\/stats\/songs\/[^)]+\)/gim,
  )) {
    const title = match[1].trim();
    if (title && !/^encore:?$/i.test(title)) songs.push(title);
  }
  return songs;
}

export function extractSetlistLinks(html: string): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  const push = (pathOrUrl: string) => {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl.replace(/^http:\/\//i, "https://")
      : `https://www.setlist.fm${pathOrUrl}`;
    if (!/\/setlist\/[^/]+\/\d{4}\//i.test(url)) return;
    if (out.some((x) => x.url === url)) return;
    out.push({ url, label: url });
  };
  for (const match of html.matchAll(/href="(\/setlist\/[^"]+\.html)"/gi)) {
    push(match[1]);
  }
  for (const match of html.matchAll(
    /\((https?:\/\/(?:www\.)?setlist\.fm\/setlist\/[^)\s]+\.html)\)/gi,
  )) {
    push(match[1]);
  }
  return out;
}

function dateMatchesPage(html: string, isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-");
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthShort = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mi = Number(m) - 1;
  const patterns = [
    isoDate,
    `${d}.${m}.${y}`,
    `${Number(d)}.${Number(m)}.${y}`,
    `${y}/${m}/${d}`,
    `${monthShort[mi]} ${Number(d)} ${y}`,
    `${monthNames[mi]} ${Number(d)}, ${y}`,
    `${monthNames[mi]} ${Number(d)} ${y}`,
  ];
  return patterns.some((p) => html.includes(p));
}

function germanDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${Number(d)}.${Number(m)}.${y}`;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,text/plain,*/*",
      },
      signal: AbortSignal.timeout(25000),
      redirect: "follow",
    });
    if (!res.ok || res.status === 202) return null;
    const text = await res.text();
    if (!text || text.length < 200) return null;
    return text;
  } catch {
    return null;
  }
}

/** Direct fetch, then r.jina.ai reader when setlist.fm blocks bots (HTTP 202). */
async function fetchSetlistPage(url: string): Promise<string | null> {
  const direct = await fetchText(url);
  if (direct) return direct;
  const viaProxy = await fetchText(`https://r.jina.ai/http://${url.replace(/^https?:\/\//i, "")}`);
  return viaProxy;
}

function songsFromPage(page: string): string[] {
  const htmlSongs = parseSetlistFmSongs(page);
  if (htmlSongs.length) return htmlSongs;
  return parseSetlistFmMarkdownSongs(page);
}

export async function fetchSetlistFromSetlistFm(input: {
  artistName: string;
  city: string;
  date: string;
  venue?: string;
}): Promise<{ setlistFmUrl: string | null; songs: string[] }> {
  const deDate = germanDate(input.date);
  const queries = [
    `${input.artistName} ${input.city} ${input.date}`,
    `${input.artistName} ${input.city} ${deDate}`,
    `${input.artistName} ${input.venue || ""} ${input.city} ${input.date}`.trim(),
    `${input.artistName} ${input.venue || ""} ${input.city} ${deDate}`.trim(),
    `${input.artistName} ${input.date}`,
    `${input.artistName} ${deDate}`,
  ];

  for (const query of [...new Set(queries.filter(Boolean))]) {
    const searchUrl = `https://www.setlist.fm/search?query=${encodeURIComponent(query)}`;
    const html = await fetchSetlistPage(searchUrl);
    if (!html) continue;
    const links = extractSetlistLinks(html).slice(0, 8);
    for (const link of links) {
      const page = await fetchSetlistPage(link.url);
      if (!page) continue;
      if (!dateMatchesPage(page, input.date)) continue;
      const songs = songsFromPage(page);
      if (songs.length) return { setlistFmUrl: link.url, songs };
      return { setlistFmUrl: link.url, songs: [] };
    }
  }

  return { setlistFmUrl: null, songs: [] };
}
