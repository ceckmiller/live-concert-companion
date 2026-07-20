const MONTHS_DE = [
  "januar",
  "februar",
  "märz",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "dezember",
];

const MONTHS_EN = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function parseConcertSort(sort) {
  const [y, m, d] = sort.split("-").map(Number);
  return { y, m, d };
}

export function concertDateMatchPatterns(sort) {
  const { y, m, d } = parseConcertSort(sort);
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const deMonth = MONTHS_DE[m - 1];
  const enMonth = MONTHS_EN[m - 1];
  return [
    `${y}-${mm}-${dd}`,
    `${dd}.${mm}.${y}`,
    `${d}.${m}.${y}`,
    `${d}.${mm}.${y}`,
    `${dd}/${mm}/${y}`,
    `${d}/${m}/${y}`,
    `${d}. ${deMonth} ${y}`,
    `${dd}. ${deMonth} ${y}`,
    `${d} ${deMonth} ${y}`,
    `${d} ${enMonth} ${y}`,
    `${enMonth} ${d}, ${y}`,
    `${enMonth} ${d} ${y}`,
    `${d}.${m}.${String(y).slice(2)}`,
    `${dd}.${mm}.${String(y).slice(2)}`,
  ];
}

export function festivalAliasesForConcert(concertId) {
  if (concertId.includes("madstock")) return ["madstock", "finsbury park"];
  return [];
}

export function textMatchesConcertLocation(text, city, venue) {
  if (!text?.trim()) return false;
  const lower = text.toLowerCase();
  const cityNorm = city?.trim().toLowerCase();
  const venueNorm = venue?.trim().toLowerCase();
  if (cityNorm && cityNorm.length > 2 && lower.includes(cityNorm)) return true;
  if (venueNorm && venueNorm.length > 4 && lower.includes(venueNorm)) return true;
  return false;
}

/**
 * Live footage must reference the concert date (day+month+year, ISO date, or festival+day+month+year).
 */
export function textMatchesConcertDate(text, sort, { festivalAliases = [] } = {}) {
  if (!text?.trim() || !sort?.trim()) return false;
  const lower = text.toLowerCase();
  const { y, m, d } = parseConcertSort(sort);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;

  for (const alias of festivalAliases) {
    const aliasLower = alias.toLowerCase();
    if (aliasLower === "madstock" && (lower.includes("(madstock)") || lower.includes("madstock festival"))) {
      return true;
    }
  }

  if (!lower.includes(String(y))) return false;

  if (concertDateMatchPatterns(sort).some((pattern) => lower.includes(pattern.toLowerCase()))) {
    return true;
  }

  for (const alias of festivalAliases) {
    const aliasLower = alias.toLowerCase();
    if (!lower.includes(aliasLower)) continue;
    const hasDay = new RegExp(`\\b${d}\\b`).test(lower) || lower.includes(`${d}.`) || lower.includes(`${d}/`);
    const hasMonth =
      lower.includes(String(m)) ||
      lower.includes(MONTHS_DE[m - 1]) ||
      lower.includes(MONTHS_EN[m - 1]);
    if (hasDay && hasMonth) return true;
  }

  return false;
}

export function filterLiveVideosByDate(videos, sort, options = {}) {
  if (!videos || typeof videos !== "object") return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [song, url] of Object.entries(videos)) {
    const metaText = options.videoTextByUrl?.[url];
    if (metaText && textMatchesSongLiveVideo(metaText, song, sort, options)) {
      out[song] = url;
    }
  }
  return out;
}

export function normalizeSongToken(song) {
  return song
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim()
    .toLowerCase();
}

export function textMatchesSongInVideo(text, song) {
  const token = normalizeSongToken(song);
  if (!token) return false;
  const lower = text.toLowerCase();
  if (lower.includes(token)) return true;
  const words = token.split(/\s+/).filter((word) => word.length > 2);
  if (words.length >= 3 && words.slice(0, 3).every((word) => lower.includes(word))) return true;
  if (words.length >= 2 && words.slice(0, 2).every((word) => lower.includes(word))) return true;
  return words.length === 1 && lower.includes(words[0]);
}

/**
 * Per-song live link: must match concert date, place (city/venue), and song in metadata.
 */
export function textMatchesSongLiveVideo(text, song, sort, options = {}) {
  const { festivalAliases = [], city = "", venue = "" } = options;
  if (!textMatchesConcertDate(text, sort, { festivalAliases })) return false;
  if (!textMatchesSongInVideo(text, song)) return false;
  if (festivalAliases.length > 0) return true;
  return textMatchesConcertLocation(text, city, venue);
}
