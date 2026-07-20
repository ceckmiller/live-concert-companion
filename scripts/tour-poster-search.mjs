/** DuckDuckGo image search for real tour posters (fallback when only album art exists). */

const USER_AGENT = "Mozilla/5.0 (compatible; LiveKonzertCompanion/1.0; tour poster search)";

const TOUR_STOPWORDS = new Set([
  "live",
  "tour",
  "world",
  "european",
  "festival",
  "show",
  "open",
  "air",
  "the",
  "and",
  "von",
  "der",
  "die",
  "das",
]);

export function extractYears(text) {
  const matches = `${text}`.match(/\b(?:19|20)\d{2}\b/g);
  return matches ? [...new Set(matches.map((y) => Number(y)))] : [];
}

export function tourQueryParts(tourName, year = "") {
  const tour = `${tourName}`.trim();
  const yearStr = `${year}`.trim();
  const tourHasYear = yearStr && tour.includes(yearStr);
  return { tour, yearStr: tourHasYear ? "" : yearStr };
}

export function buildTourPosterQuery(artistName, tourName, year) {
  const { tour, yearStr } = tourQueryParts(tourName, year);
  return [artistName, tour, yearStr, "tour poster"].filter(Boolean).join(" ");
}

export function buildTourPosterQueries(artistName, tourName, year) {
  const { tour, yearStr } = tourQueryParts(tourName, year);
  const core = [artistName, tour, yearStr].filter(Boolean);
  return [...new Set([
    [...core, "tour poster"].join(" "),
    [...core, "Tourplakat"].join(" "),
    [...core, "Konzertplakat"].join(" "),
    [artistName, tourName, yearStr, "Plakat"].filter(Boolean).join(" "),
  ])];
}

export function normalizeArtistName(name) {
  return `${name}`.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();
}

export function artistMatchTokens(artistName) {
  return normalizeArtistName(artistName)
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function artistMatchesResult(artistName, title, url = "") {
  const blob = `${title} ${url}`.toLowerCase();
  const normalized = normalizeArtistName(artistName);
  if (!normalized) return false;

  if (blob.includes(normalized)) return true;

  const tokens = artistMatchTokens(artistName);
  if (!tokens.length) return blob.includes(normalized.slice(0, 4));

  return tokens.every((token) => blob.includes(token));
}

export function looksLikeTourPoster(title, url = "") {
  const blob = `${title} ${url}`.toLowerCase();
  if (/alamy|shutterstock|gettyimages|istockphoto|konzertfoto|live bei einem konzert|concert photo/.test(blob)) {
    return false;
  }
  if (/poster|plakat|flyer|tourbook|konzertplakat/.test(blob)) return true;
  if (/\btour\b/.test(blob) && /eventim|getgo|ticket|hallenshow|open air|tourposter|tour-poster/.test(blob)) {
    return true;
  }
  return false;
}

export function meaningfulTourTokens(tourName) {
  return `${tourName}`
    .toLowerCase()
    .replace(/\s*Tour\s*$/i, "")
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .filter((token) => !TOUR_STOPWORDS.has(token))
    .filter((token) => !/^(19|20)\d{2}$/.test(token));
}

export function tourMatchesResult(tourName, title) {
  const words = meaningfulTourTokens(tourName);
  if (!words.length) return true;
  const lower = `${title}`.toLowerCase();
  const hits = words.filter((word) => lower.includes(word));
  if (words.length === 1) return hits.length === 1;
  return hits.length >= Math.min(words.length, Math.max(1, Math.ceil(words.length * 0.6)));
}

export function yearMatchScore(text, expectedYear) {
  if (!expectedYear) return 0;
  const exp = Number(expectedYear);
  const years = extractYears(text);
  if (!years.length) return -4;
  if (years.includes(exp)) return 28;
  if (years.some((y) => Math.abs(y - exp) <= 1)) return 8;
  const closest = Math.min(...years.map((y) => Math.abs(y - exp)));
  return -closest * 10;
}

export function scorePosterResult(result, artistName, tourName, expectedYear = "") {
  const title = result.title || "";
  const url = result.image || "";
  const blob = `${title} ${url}`.toLowerCase();
  const w = result.width || 0;
  const h = result.height || 0;
  let score = 0;

  if (!artistMatchesResult(artistName, title, url)) return -999;

  if (/poster|plakat|flyer|annonce|tourbook|konzertplakat/.test(blob)) score += 18;
  if (/\btour\b/.test(blob)) score += 10;
  score += yearMatchScore(blob, expectedYear);

  const artistTokens = artistMatchTokens(artistName);
  if (artistTokens.every((token) => blob.includes(token))) score += 20;

  const tourWords = meaningfulTourTokens(tourName);
  if (tourWords.length && tourMatchesResult(tourName, title)) score += 12;
  else if (tourWords.length) score -= 10;

  if (/album cover|album art|single cover|rear\/|discogs/.test(blob)) score -= 18;
  if (/wikipedia|wiki\//.test(url)) score -= 18;
  if (/hqdefault|youtube|ytimg|lookaside\.fbsbx|\.webp$/.test(url)) score -= 10;
  if (/article|news|berliner-zeitung|tagesspiegel|presse/.test(blob)) score -= 12;
  if (/etsy|pinterest|pinimg|merchandise|t-shirt|mug|kawaii/.test(blob)) score -= 25;
  if (/prints4u|eventim|ticketmaster|axs\.com|songkick|posters\.|\/poster/.test(url)) score += 8;

  const area = w * h;
  if (area > 400_000) score += 8;
  else if (area > 150_000) score += 4;
  if (w > 0 && h > 0 && Math.abs(w / h - 1) < 0.15 && area < 500_000) score -= 8;

  return score;
}

export function posterYearMatches(text, expectedYear) {
  if (!expectedYear) return true;
  const years = extractYears(text);
  if (!years.length) return false;
  const exp = Number(expectedYear);
  return years.some((y) => Math.abs(y - exp) <= 1);
}

export function rankPosterResults(results, artistName, tourName, expectedYear = "") {
  return (results || [])
    .map((result) => {
      const title = result.title || "";
      const url = result.image || "";
      const score = scorePosterResult(result, artistName, tourName, expectedYear);
      return {
        url,
        title,
        width: result.width || 0,
        height: result.height || 0,
        score,
        yearOk: posterYearMatches(`${title} ${url}`, expectedYear),
        artistOk: artistMatchesResult(artistName, title, url),
      };
    })
    .filter((row) => row.url?.startsWith("http"))
    .filter((row) => row.artistOk)
    .filter((row) => row.score > -100)
    .filter((row) => !expectedYear || row.yearOk)
    .filter((row) => looksLikeTourPoster(row.title, row.url))
    .sort((a, b) => b.score - a.score);
}

export async function searchTourPosterImage(query, { artistName = "", tourName = "", expectedYear = "", minScore = 20 } = {}) {
  const page = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!page.ok) return null;

  const html = await page.text();
  const vqd = html.match(/vqd="([^"]+)"/)?.[1] || html.match(/vqd=([\d-]+)/)?.[1];
  if (!vqd) return null;

  const images = await fetch(
    `https://duckduckgo.com/i.js?l=de-de&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`,
    { headers: { "User-Agent": USER_AGENT, Referer: "https://duckduckgo.com/" } },
  );
  if (!images.ok) return null;

  const data = await images.json();
  const ranked = rankPosterResults(data.results, artistName, tourName, expectedYear);
  const best = ranked[0];
  if (!best || best.score < minScore) return null;
  return best;
}

export async function searchTourPosterWithQueries(queries, options) {
  for (const query of queries) {
    const hit = await searchTourPosterImage(query, options);
    if (hit) return { ...hit, query };
  }
  return null;
}

async function fetchDdgImageResults(query) {
  const page = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!page.ok) return [];

  const html = await page.text();
  const vqd = html.match(/vqd="([^"]+)"/)?.[1] || html.match(/vqd=([\d-]+)/)?.[1];
  if (!vqd) return [];

  const images = await fetch(
    `https://duckduckgo.com/i.js?l=de-de&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`,
    { headers: { "User-Agent": USER_AGENT, Referer: "https://duckduckgo.com/" } },
  );
  if (!images.ok) return [];

  const data = await images.json();
  return data.results || [];
}

export function buildConcertPosterQueries(artistName, tourName, year, city = "") {
  const { tour, yearStr } = tourQueryParts(tourName, year);
  const loc = `${city}`.trim();
  const core = [artistName, tour, loc, yearStr].filter(Boolean);
  return [
    ...new Set([
      [...core, "Tourplakat"].join(" "),
      [...core, "Konzertplakat"].join(" "),
      [...core, "tour poster"].join(" "),
      ...buildTourPosterQueries(artistName, tourName, year),
    ]),
  ];
}

export function buildDefaultConcertPosterQuery(artistName, tourName, year, city = "") {
  return buildConcertPosterQueries(artistName, tourName, year, city)[0] || "";
}

export async function searchTourPosterCandidates(
  artistName,
  tourName,
  year,
  city = "",
  limit = 10,
  customQuery = "",
) {
  const trimmed = `${customQuery}`.trim();
  const queries = trimmed ? [trimmed] : buildConcertPosterQueries(artistName, tourName, year, city);
  const seen = new Set();
  const combined = [];

  for (const query of queries) {
    if (combined.length >= limit) break;
    try {
      const results = await fetchDdgImageResults(query);
      const ranked = rankPosterResults(results, artistName, tourName, year);
      for (const row of ranked) {
        if (seen.has(row.url)) continue;
        seen.add(row.url);
        combined.push({
          url: row.url,
          title: row.title,
          width: row.width,
          height: row.height,
          score: row.score,
        });
        if (combined.length >= limit) break;
      }
    } catch {
      /* try next query */
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  return combined.sort((a, b) => b.score - a.score).slice(0, limit);
}
