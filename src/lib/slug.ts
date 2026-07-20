export function slugify(text: string): string {
  return (
    String(text)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "artist"
  );
}

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export function formatGermanDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]} ${y}`;
}

export function formatWeekdayTime(isoDate: string, time = "20:00"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dd = String(d).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const yy = String(y).slice(-2);
  return `${WEEKDAYS[dt.getDay()]} ${dd}.${mm}.${yy}, ${time} Uhr`;
}

export function concertSlug(city: string, isoDate: string): string {
  const cityPart = slugify(city || "konzert");
  return `${cityPart}-${isoDate}`;
}

export function setlistFmSearchUrl(artistName: string, city: string, isoDate: string): string {
  const q = encodeURIComponent(`${artistName} ${city} ${isoDate}`);
  return `https://www.setlist.fm/search?query=${q}`;
}
