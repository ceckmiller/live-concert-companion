/**
 * Search the web for concert reviews / Kritiken.
 */

const USER_AGENT = "Mozilla/5.0 (compatible; LiveKonzertCompanion/1.0; concert review search)";

const REVIEW_HINT =
  /kritik|review|rezension|live[- ]?bericht|konzertbericht|live report|concert review|fotos?\/review/i;

const GOOD_HOST =
  /\b(laut\.de|rollingstone\.de|concertnews\.de|musikexpress\.de|intro\.de|tip-berlin\.de|berliner-zeitung\.de|tagesspiegel\.de|morgenpost\.de|waz\.de|rp-online\.de|spiegel\.de|zeit\.de|faz\.net|sz\.de|deutschlandfunk\.de|br\.de|ndr\.de|wdr\.de|rbb24\.de|mixing\.de|rockinberlin\.de|metal-hammer\.de|visions\.de|plattentests\.de|nightfall\.fr|setlist\.fm)\b/i;

const BAD_HOST =
  /\b(youtube\.com|youtu\.be|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|wikipedia\.org|amazon\.|ebay\.|ticket|eventim\.|spotify\.com|apple\.com\/music)\b/i;

export function reviewSearchQueries(task) {
  const year = String(task.sort || "").slice(0, 4);
  const artist = task.artistName?.trim() || "";
  const city = task.city?.trim() || "";
  const venue = task.venue?.trim() || "";
  return [
    [artist, city, year, "Konzert Kritik"].filter(Boolean).join(" "),
    [artist, venue || city, year, "Review"].filter(Boolean).join(" "),
    [artist, city, year, "live Bericht"].filter(Boolean).join(" "),
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);
}

export function scoreReviewHit(hit, task) {
  const blob = `${hit.title || ""} ${hit.url || ""}`.toLowerCase();
  let score = 0;
  if (REVIEW_HINT.test(blob)) score += 35;
  if (GOOD_HOST.test(hit.url || "")) score += 40;
  if (BAD_HOST.test(hit.url || "")) score -= 80;
  const artist = (task.artistName || "").toLowerCase();
  if (artist && blob.includes(artist)) score += 20;
  const year = String(task.sort || "").slice(0, 4);
  if (year && blob.includes(year)) score += 15;
  const city = (task.city || "").toLowerCase();
  if (city && blob.includes(city)) score += 10;
  const venue = (task.venue || "").toLowerCase().slice(0, 8);
  if (venue.length > 3 && blob.includes(venue)) score += 10;
  return score;
}

export function sourceFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function decodeDuckRedirect(href) {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return href.startsWith("http") ? href : "";
  } catch {
    return "";
  }
}

async function searchDuckDuckGoHtml(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const hits = [];
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && hits.length < 10) {
    const href = decodeDuckRedirect(m[1]);
    const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!href || !title) continue;
    hits.push({ title, url: href });
  }
  return hits;
}

export async function findConcertReviews(task, { limit = 3 } = {}) {
  const queries = reviewSearchQueries(task);
  const seen = new Set();
  const ranked = [];

  for (const q of queries) {
    let hits = [];
    try {
      hits = await searchDuckDuckGoHtml(q);
    } catch {
      hits = [];
    }
    for (const hit of hits) {
      const key = hit.url.replace(/#.*$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      const score = scoreReviewHit(hit, task);
      if (score < 40) continue;
      ranked.push({
        title: hit.title,
        url: hit.url,
        source: sourceFromUrl(hit.url),
        score,
      });
    }
    if (ranked.filter((r) => r.score >= 55).length >= limit) break;
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map(({ title, url, source }) => ({ title, url, source }));
}
