#!/usr/bin/env node
/**
 * Curated YouTube links for Madstock 1992 and Voodoo Jürgens Astra 2026.
 * Run: node scripts/apply-madstock-voodoo-youtube.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const enrichmentPath = path.join(root, "data", "other-concerts-enrichment.json");
const livePath = path.join(root, "data", "concert-live-videos.json");
const recordingsOtherPath = path.join(root, "scripts", "concert-recordings-other.mjs");

const yt = (id) => `https://www.youtube.com/watch?v=${id}`;

const morrisseyMadstock = {
  "You're Gonna Need Someone on Your Side": yt("CnoJkMY1x7c"),
  "Glamorous Glue": yt("M6DnMA5IiB8"),
  "Girl Least Likely To": yt("2g_1YkVBTEA"),
  "The National Front Disco": yt("3-saBMaM_g4"),
  "November Spawned a Monster": yt("ihZoKNCCdSQ"),
  "We'll Let You Know": yt("F-QqYh5h_2s"),
  "Sister I'm a Poet": yt("zyexnR8cEpA"),
  Suedehead: yt("mzekx_RgjcU"),
  "You're the One for Me, Fatty": yt("vaVKWr17yBU"),
};

const madnessMadstock = {
  "One Step Beyond (cover)": yt("trAi4qvjJk4"),
  "The Prince": yt("8lgr_4lRFOs"),
  Embarrassment: yt("Q-mErzYNV3o"),
  "My Girl": yt("7gqkcb9-4Fg"),
  "The Sun and the Rain": yt("kDa65TgFyG8"),
  "Land of Hope and Glory": yt("Uw3aRNe0htc"),
  "Grey Day": yt("HaCPgsr-xzM"),
  "Razor Blade Alley": yt("lMZHgdiGD2A"),
  "It Must Be Love (cover)": yt("o39pZIt8k_M"),
  "Tomorrow's (Just Another Day)": yt("FeMQR0TVHeM"),
  "Take It or Leave It": yt("FeMQR0TVHeM"),
  "Shut Up": yt("QWJk9N3G7Gc"),
  "Driving in My Car": yt("INqblqdP_OI"),
  "Bed and Breakfast Man": yt("bzOLU491Lts"),
  "Close Escape": yt("nDf9nC8CqEQ"),
  "Wings of a Dove": yt("o2T21SPcwGs"),
  "Our House": yt("qP8rdUivoYs"),
  "Night Boat to Cairo": yt("56JfHlzMItg"),
  "Madness (cover)": yt("56JfHlzMItg"),
  "Swan Lake (cover)": yt("kDa65TgFyG8"),
  "House of Fun": yt("JaWO9v4nC0M"),
  "Rockin' in A♭ (cover)": yt("kDa65TgFyG8"),
  "Baggy Trousers": yt("QVq6QxWEZTs"),
  "The Harder They Come (cover)": yt("txMqJ6IKjl0"),
};

const ianDuryMadstock = {
  "Hit Me With Your Rhythm Stick": yt("52ve8QO_TEo"),
  "Sex & Drugs & Rock & Roll": yt("52ve8QO_TEo"),
  "Reasons to Be Cheerful, Part 3": yt("52ve8QO_TEo"),
  "What a Waste": yt("52ve8QO_TEo"),
  "Billericay Dickie": yt("52ve8QO_TEo"),
};

const voodooLive = {
  "Guade Stubn": yt("Mk8w3xADYKw"),
  Vaschwindn: yt("AvYOSg6T8Wg"),
  "De An und de Aundan": yt("3jF63rCicDk"),
  "Langsam wirst ma fremd": yt("GCd37iym0FY"),
  "Da Dings": yt("r7Ajqm9zHDU"),
  "3 Gschichtn ausn Cafe Fesch": yt("nBVE0Vkudnw"),
  Taxitänzer: yt("GQcDqopP5t4"),
  Gitti: yt("Mk8w3xADYKw"),
  "In deiner Nähe": yt("GCd37iym0FY"),
  Gschnas: yt("ZHR3dSxzQHo"),
  "Es geht ma ned ei": yt("5lLKPEA4PJ8"),
  Twist: yt("r7Ajqm9zHDU"),
  "2l Eistee": yt("Mk8w3xADYKw"),
  "'S klane Glücksspiel": yt("GCd37iym0FY"),
  "Heite grob ma Tote aus": yt("CR4GF82PGds"),
  "Da Zweifl": yt("r7Ajqm9zHDU"),
  "Angst haums": yt("YQDP4sprPsw"),
  Kassiber: yt("srW3atnBqB8"),
  Federkleid: yt("a6QIXFdbIWI"),
  Tulln: yt("CR4GF82PGds"),
  "Ka Ruah": yt("ZHR3dSxzQHo"),
};

const madstockRecordings = [
  { title: "Morrissey — Madstock 1992 (Full Concert)", url: yt("iLnVUeIVQKU"), duration: "?" },
  { title: "Morrissey — Madstock 1992 (60 FPS Enhanced)", url: yt("C9N8piRFVcU"), duration: "?" },
  { title: "Morrissey at Finsbury Park — MTV (1992)", url: yt("XN8sBu2Xc0c"), duration: "?" },
  { title: "Morrissey — Madstock 1992 (Finsbury Park)", url: yt("IcRr3nbnl8o"), duration: "37:55" },
  { title: "Madness — MADSTOCK 1992 (Festival)", url: yt("kDa65TgFyG8"), duration: "?" },
  { title: "Madness — Princes of Ska (Madstock Dokumentation)", url: yt("5Nt6XcjWmwE"), duration: "?" },
  { title: "Madness — Our House (Live at Madstock 1992)", url: yt("qP8rdUivoYs"), duration: "3:23" },
  { title: "Flowered Up — Madstock 1992 (Finsbury Park)", url: yt("Al0zSy86Q3E"), duration: "?" },
];

const voodooRecordings = [
  { title: "Voodoo Jürgens — Astra Berlin (15.05.2026, Clip 5)", url: yt("Mk8w3xADYKw"), duration: "?" },
  { title: "Voodoo Jürgens — Astra Berlin (15.05.2026, Clip 3)", url: yt("GCd37iym0FY"), duration: "?" },
  { title: "Voodoo Jürgens — Astra Berlin (15.05.2026, Clip 2)", url: yt("r7Ajqm9zHDU"), duration: "?" },
  { title: "Voodoo Jürgens — Astra Berlin (15.05.2026)", url: yt("GQcDqopP5t4"), duration: "?" },
  { title: "Voodoo Jürgens — Heite grob ma Tote aus (live)", url: yt("CR4GF82PGds"), duration: "?" },
];

const enrichment = JSON.parse(fs.readFileSync(enrichmentPath, "utf8"));
const live = JSON.parse(fs.readFileSync(livePath, "utf8"));

const madstock = enrichment["madstock-1992-08-08"];
if (madstock?.acts) {
  for (const act of madstock.acts) {
    let map = {};
    if (act.artistId === "morrissey") map = morrisseyMadstock;
    else if (act.artistId === "madness") map = madnessMadstock;
    else if (act.artistId === "ian-dury-and-the-blockheads") map = ianDuryMadstock;
    if (!Object.keys(map).length) continue;
    act.videos = { ...(act.videos || {}), ...map };
  }
}

live["madstock-1992-08-08"] = {
  ...morrisseyMadstock,
  ...Object.fromEntries(
    Object.entries(madnessMadstock).filter(([song]) => !morrisseyMadstock[song]),
  ),
};

const voodoo = enrichment["voodoo-juergens-2026-05-13"];
if (voodoo) {
  voodoo.videos = { ...(voodoo.videos || {}), ...voodooLive };
  live["voodoo-juergens-2026-05-13"] = voodoo.videos;
}

fs.writeFileSync(enrichmentPath, `${JSON.stringify(enrichment, null, 2)}\n`);
fs.writeFileSync(livePath, `${JSON.stringify(live, null, 2)}\n`);

// Patch concert-recordings-other.mjs
let recSrc = fs.readFileSync(recordingsOtherPath, "utf8");
const madstockBlock = JSON.stringify(madstockRecordings, null, 2).replace(/"([^"]+)":/g, "$1:");
const voodooBlock = JSON.stringify(voodooRecordings, null, 2).replace(/"([^"]+)":/g, "$1:");

recSrc = recSrc.replace(
  /"madstock-1992-08-08": \[[\s\S]*?\],/,
  `"madstock-1992-08-08": ${madstockBlock},`,
);
if (recSrc.includes('"voodoo-juergens-2026-05-13"')) {
  recSrc = recSrc.replace(
    /"voodoo-juergens-2026-05-13": \[[\s\S]*?\],/,
    `"voodoo-juergens-2026-05-13": ${voodooBlock},`,
  );
} else {
  recSrc = recSrc.replace(
    /export const CONCERT_RECORDINGS = \{/,
    `export const CONCERT_RECORDINGS = {\n  "voodoo-juergens-2026-05-13": ${voodooBlock},`,
  );
}
fs.writeFileSync(recordingsOtherPath, recSrc);

console.log("Applied Madstock + Voodoo YouTube enrichment");
