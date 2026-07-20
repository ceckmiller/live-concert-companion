import { describe, expect, it } from "vitest";
import { OTHER_CONCERTS } from "./live-konzert-companion-concerts.mjs";
import enrichmentData from "../data/other-concerts-enrichment.json" with { type: "json" };
import assetManifest from "../data/asset-manifest.json" with { type: "json" };
import { buildConcertVideos, getOfficialVideo } from "./official-videos-other.mjs";
import concertLiveVideos from "../data/concert-live-videos.json" with { type: "json" };
import { getSongMeta } from "./other-song-meta.mjs";
import { CONCERT_RECORDINGS } from "./concert-recordings-other.mjs";
import { TOUR_POSTERS } from "./tour-posters.mjs";

type EnrichmentEntry = {
  setlist?: string[];
  setlistComplete?: boolean;
  acts?: {
    artistId: string;
    setlist?: string[];
    setlistComplete?: boolean;
    videos?: Record<string, string>;
  }[];
};

function enrichmentEntries() {
  return enrichmentData as Record<string, EnrichmentEntry>;
}

function concertSetlists(c: { id: string; artistId: string }) {
  const enrichment = enrichmentEntries()[c.id];
  if (enrichment?.acts?.length) {
    return enrichment.acts.map((act) => ({
      artistId: act.artistId,
      setlist: act.setlist ?? [],
      setlistComplete: act.setlistComplete !== false,
    }));
  }
  return [
    {
      artistId: c.artistId,
      setlist: enrichment?.setlist ?? [],
      setlistComplete: enrichment?.setlistComplete !== false,
    },
  ];
}

describe("concert enrichment data", () => {
  it("covers every other concert id", () => {
    const missing = OTHER_CONCERTS.filter((c) => !(enrichmentData as Record<string, unknown>)[c.id]);
    expect(missing.map((c) => c.id)).toEqual([]);
  });

  it("has artist images for every artist slug", () => {
    const slugs = [...new Set(OTHER_CONCERTS.map((c) => c.artistId)), "morrissey"];
    const manifest = assetManifest as { artists: Record<string, string> };
    const missing = slugs.filter((slug) => !manifest.artists[slug]);
    expect(missing).toEqual([]);
  });

  it("keeps Morrissey Madstock act live videos in enrichment", () => {
    const morrissey = enrichmentEntries()["madstock-1992-08-08"]?.acts?.find((a) => a.artistId === "morrissey");
    expect(morrissey?.videos?.["Suedehead"]).toMatch(/youtube\.com/);
  });

  it("separates official music videos from per-concert live video data", () => {
    const official = getOfficialVideo("placebo", "Every You Every Me");
    expect(official).toMatch(/youtube\.com/);
    const live = (concertLiveVideos as Record<string, Record<string, string>>)["placebo-2022-10-06"];
    if (live?.["Every You Every Me"]) {
      expect(live["Every You Every Me"]).not.toBe(official);
    }
  });

  it("links official youtube videos for complete setlists", () => {
    let total = 0;
    let linked = 0;
    for (const c of OTHER_CONCERTS) {
      for (const block of concertSetlists(c)) {
        if (!block.setlist.length || !block.setlistComplete) continue;
        const videos = buildConcertVideos(block.artistId, block.setlist, {
          setlistComplete: block.setlistComplete,
        });
        total += block.setlist.length;
        linked += Object.keys(videos).length;
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(linked / total).toBeGreaterThan(0.35);
  });

  it("skips song video links when setlist is marked incomplete", () => {
    const zm = enrichmentEntries()["peace-by-peace-2016-06-05"]?.acts?.find(
      (a) => a.artistId === "zugezogen-maskulin",
    );
    expect(zm?.setlistComplete).toBe(false);
    expect(buildConcertVideos("zugezogen-maskulin", zm?.setlist ?? [], { setlistComplete: false })).toEqual(
      {},
    );
    const seeed = enrichmentEntries()["peace-by-peace-2016-06-05"]?.acts?.find(
      (a) => a.artistId === "seeed",
    );
    expect(seeed?.setlistComplete).not.toBe(false);
    expect(Object.keys(buildConcertVideos("seeed", seeed?.setlist ?? [], { setlistComplete: true })).length).toBeGreaterThan(
      5,
    );
  });

  it("has album metadata for setlist songs", () => {
    let total = 0;
    let withAlbum = 0;
    for (const c of OTHER_CONCERTS) {
      for (const block of concertSetlists(c)) {
        for (const song of block.setlist) {
          total++;
          const meta = getSongMeta(block.artistId, song);
          if (meta.album) withAlbum++;
        }
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(withAlbum / total).toBeGreaterThan(0.85);
  });

  it("seeds longer recordings for major concerts", () => {
    expect(CONCERT_RECORDINGS["the-cure-2016-10-18"]?.[0]?.url).toMatch(/youtube\.com/);
    expect(CONCERT_RECORDINGS["the-cure-2022-10-18"]?.[0]?.duration).toMatch(/:/);
    expect(CONCERT_RECORDINGS["placebo-2022-10-06"]?.[0]?.duration).toMatch(/:/);
  });

  it("includes The Cure Mercedes-Benz Arena Berlin 2022 with Disintegration set", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "the-cure-2022-10-18")).toBe(true);
    const cure = enrichmentData["the-cure-2022-10-18"] as { venue: string; tour: string; setlist: string[] };
    expect(cure.venue).toBe("Mercedes-Benz Arena");
    expect(cure.tour).toBe("Shows of a Lost World");
    expect(cure.setlist).toContain("Alone");
    expect(cure.setlist).toContain("Disintegration");
    expect(cure.setlist).toContain("Endsong");
  });

  it("includes Capital Bra and CRO at Verti Music Hall Berlin", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "capital-bra-2019-05-07")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "cro-2022-05-08")).toBe(true);
    const bra = enrichmentData["capital-bra-2019-05-07"] as { venue: string; tour: string; setlist: string[] };
    expect(bra.venue).toBe("Verti Music Hall");
    expect(bra.tour).toBe("Gucciland Tour");
    expect(bra.setlist).toContain("Neymar");
    const cro = enrichmentData["cro-2022-05-08"] as { venue: string; tour: string; setlist: string[] };
    expect(cro.venue).toBe("Verti Music Hall");
    expect(cro.tour).toBe("trip is (a)live 2022");
    expect(cro.setlist).toContain("ALLES DOPE");
    expect(cro.setlist).toContain("unendlichkeit - Main Edit");
  });

  it("includes Jan Delay Columbiahalle and U2 Mercedes-Benz Arena Berlin", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "jan-delay-2022-08-01")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "u2-2015-09-28")).toBe(true);
    const delay = enrichmentData["jan-delay-2022-08-01"] as { venue: string; tour: string; note: string; setlist: string[] };
    expect(delay.venue).toBe("Columbiahalle");
    expect(delay.tour).toBe("Earth, Wind & Feiern");
    expect(delay.note).toMatch(/Solingen/i);
    expect(delay.setlist).toContain("Oh Jonny");
    expect(delay.setlist).toContain("St. Pauli");
    const u2 = enrichmentData["u2-2015-09-28"] as { venue: string; tour: string; setlist: string[] };
    expect(u2.venue).toBe("Mercedes-Benz Arena");
    expect(u2.tour).toBe("Innocence + Experience Tour");
    expect(u2.setlist).toContain("New Year's Day");
    expect(u2.setlist).toContain("Where the Streets Have No Name");
    expect(u2.setlist.length).toBe(25);
  });

  it("includes Robbie Williams Berlin shows from Velodrom to Mercedes-Benz Arena", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "robbie-williams-2005-10-09")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "robbie-williams-2006-07-28")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "robbie-williams-2017-07-25")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "robbie-williams-2023-02-21")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "robbie-williams-2014-05-28")).toBe(true);
    const rw2005 = enrichmentData["robbie-williams-2005-10-09"] as { venue: string; tour: string; setlist: string[] };
    expect(rw2005.venue).toBe("Velodrom");
    expect(rw2005.tour).toBe("Robbie Live — Intensive Care");
    expect(rw2005.setlist).toContain("Make Me Pure");
    const rw2006 = enrichmentData["robbie-williams-2006-07-28"] as { venue: string; tour: string; setlist: string[] };
    expect(rw2006.venue).toBe("Olympiastadion");
    expect(rw2006.setlist).toContain("Rudebox");
    const rw2017 = enrichmentData["robbie-williams-2017-07-25"] as { venue: string; setlist: string[] };
    expect(rw2017.venue).toBe("Waldbühne");
    expect(rw2017.setlist).toContain("Party Like a Russian");
    const rw2023 = enrichmentData["robbie-williams-2023-02-21"] as { venue: string; tour: string; setlist: string[] };
    expect(rw2023.venue).toBe("Mercedes-Benz Arena");
    expect(rw2023.tour).toBe("XXV Tour");
    expect(rw2023.setlist).toContain("Hey Wow Yeah Yeah");
    const rw2014 = enrichmentData["robbie-williams-2014-05-28"] as { venue: string; tour: string; note: string; setlist: string[] };
    expect(rw2014.venue).toBe("Mercedes-Benz Arena");
    expect(rw2014.tour).toBe("Swings Both Ways Live Tour");
    expect(rw2014.note).toMatch(/O2 World/i);
    expect(rw2014.setlist).toContain("Swings Both Ways");
    expect(rw2014.setlist).toContain("Sensational");
  });

  it("only allows empty setlists for future concerts and undocumented shows", () => {
    const empty = OTHER_CONCERTS.filter((c) => {
      const enrichment = enrichmentEntries()[c.id];
      const setlist = enrichment?.setlist ?? [];
      const hasActs = (enrichment?.acts?.length ?? 0) > 0;
      return setlist.length === 0 && !hasActs;
    }).map((c) => c.id);
    expect(empty.sort()).toEqual(
      [
        "poems-for-laila-1991-07-06",
        "stereo-mcs-1993-04-05",
        "tom-jones-2000-04-25",
      ].sort(),
    );
  });

  it("uses tour proxy setlist for Voodoo Jürgens Berlin when show is not on setlist.fm yet", () => {
    const voodoo = enrichmentEntries()["voodoo-juergens-2026-05-13"];
    expect(voodoo?.setlistComplete).toBe(false);
    expect(voodoo?.setlist?.length).toBeGreaterThan(15);
    expect(voodoo?.setlist).toContain("Heite grob ma Tote aus");
    expect(voodoo?.note).toMatch(/Hamburg.*14\.5/i);
    expect(voodoo?.note).toMatch(/Dresden.*12\.5/i);
    expect(voodoo?.setlistFmUrl).toMatch(/mojo-club-hamburg/);
  });

  it("includes Peace x Peace festival with multiple acts", () => {
    const pxp = enrichmentEntries()["peace-by-peace-2016-06-05"];
    expect(pxp?.acts?.length).toBeGreaterThan(5);
    expect(pxp?.acts?.some((a) => a.artistId === "seeed" && (a.setlist?.length ?? 0) > 5)).toBe(true);
    expect(pxp?.acts?.some((a) => a.artistId === "beatsteaks" && (a.setlist?.length ?? 0) > 5)).toBe(true);
  });

  it("includes PxP Festival 2017 with per-artist setlists from setlist.fm", () => {
    const pxp2017 = enrichmentEntries()["peace-by-peace-2017-06-18"];
    expect(pxp2017?.acts?.length).toBe(13);
    expect(pxp2017?.setlistFmUrl).toMatch(/pxp-festival-2017/);
    const bilderbuchAct = pxp2017?.acts?.find((a) => a.artistId === "bilderbuch");
    expect(bilderbuchAct?.setlist).toEqual(["Maschin", "Baba", "Spliff", "OM", "Baba 2", "Bungalow"]);
    expect(bilderbuchAct?.setlistFmUrl).toMatch(/bilderbuch\/2017\/waldbuhne/);
    const beginner = pxp2017?.acts?.find((a) => a.artistId === "beginner");
    expect(beginner?.setlist?.length).toBe(7);
    const freundeskreis = pxp2017?.acts?.find((a) => a.artistId === "freundeskreis");
    expect(freundeskreis?.setlist).toContain("Esperanto");
    expect(freundeskreis?.note).toMatch(/Tagesspiegel/i);
    expect(pxp2017?.acts?.every((a) => a.setlistFmUrl?.includes("waldbuhne-berlin"))).toBe(true);
  });

  it("mirrors Bilderbuch PxP 2017 slot as third Bilderbuch concert", () => {
    const bilderbuchConcerts = OTHER_CONCERTS.filter((c) => c.artistId === "bilderbuch").map((c) => c.id);
    expect(bilderbuchConcerts).toContain("bilderbuch-2017-06-18");
    expect(bilderbuchConcerts).toContain("bilderbuch-2018-04-22");
    expect(bilderbuchConcerts).toContain("bilderbuch-2022-04-11");
    const pxpSlot = enrichmentEntries()["bilderbuch-2017-06-18"];
    expect(pxpSlot?.venue).toBe("Waldbühne");
    expect(pxpSlot?.tour).toBe("Peace x Peace Festival");
    expect(pxpSlot?.setlist?.length).toBe(6);
    expect(pxpSlot?.note).toMatch(/PxP Festival 2017/i);
    expect(pxpSlot?.note).not.toMatch(/Magic Life/i);
  });

  it("uses PxP festival poster metadata for Bilderbuch Waldbühne 2017", () => {
    const pxpPoster = TOUR_POSTERS.bilderbuch?.["Peace x Peace Festival"];
    const festivalPoster = TOUR_POSTERS["peace-by-peace"]?.["Peace x Peace Festival"];
    expect(pxpPoster?.kind).toBe("poster");
    expect(festivalPoster?.poster).toBe(pxpPoster?.poster);
  });

  it("keeps Morrissey Madstock setlist only in festival chronology", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "morrissey-1992-08-08")).toBe(false);
    const madstock = enrichmentEntries()["madstock-1992-08-08"];
    const morrissey = madstock?.acts?.find((a) => a.artistId === "morrissey");
    expect(morrissey?.setlist?.length).toBe(9);
    expect(morrissey?.videos?.["Suedehead"]).toMatch(/youtube\.com/);
    expect(enrichmentEntries()["morrissey-1992-08-08"]).toBeUndefined();
  });

  it("includes Madstock festival with Morrissey live clips", () => {
    const madstock = enrichmentEntries()["madstock-1992-08-08"];
    expect(madstock?.acts?.length).toBeGreaterThan(4);
    const morrissey = madstock?.acts?.find((a) => a.artistId === "morrissey");
    expect(morrissey?.setlist?.length).toBe(9);
    expect(morrissey?.videos?.["Suedehead"]).toMatch(/youtube\.com/);
    const madness = madstock?.acts?.find((a) => a.artistId === "madness");
    expect(madness?.setlist?.length).toBeGreaterThan(20);
    expect(Object.keys(madness?.videos ?? {}).length).toBeGreaterThan(15);
    expect(madstock?.acts?.some((a) => a.artistId === "madness" && (a.setlist?.length ?? 0) > 20)).toBe(true);
  });

  it("links Voodoo Jürgens Astra 2026 tour footage", () => {
    const voodoo = enrichmentEntries()["voodoo-juergens-2026-05-13"];
    expect(Object.keys(voodoo?.videos ?? {}).length).toBeGreaterThan(10);
    expect(voodoo?.videos?.["Heite grob ma Tote aus"]).toMatch(/youtube\.com/);
  });

  it("documents Depeche Mode ticket corrections for 1998 and 2006", () => {
    const dm1998 = enrichmentData["depeche-mode-1998-09-18"] as { tour: string; setlist: string[] };
    expect(dm1998.tour).toBe("The Singles 86>98");
    expect(dm1998.setlist).toContain("Painkiller");
    const dm2006 = enrichmentData["depeche-mode-2006-01-13"] as { note: string; setlist: string[] };
    expect(dm2006.note).toMatch(/Max-Schmeling-Halle/i);
    expect(dm2006.setlist).toContain("John the Revelator");
  });

  it("reflects Depeche Mode Uber Arena shows and removes Olympiastadion entry", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "depeche-mode-2017-06-12")).toBe(false);
    expect(OTHER_CONCERTS.some((c) => c.id === "depeche-mode-2018-01-17")).toBe(false);
    const spirit = enrichmentData["depeche-mode-2017-11-24"] as { venue: string; tour: string; note: string };
    expect(spirit.venue).toBe("Uber Arena");
    expect(spirit.tour).toBe("Global Spirit Tour");
    expect(spirit.note).toMatch(/Olympiastadion/i);
    const delta = enrichmentData["depeche-mode-2013-11-25"] as { venue: string; tour: string; setlist: string[] };
    expect(delta.venue).toBe("Uber Arena");
    expect(delta.tour).toBe("Delta Machine Tour");
    expect(delta.setlist).toContain("Heaven");
  });

  it("reflects user corrections for Wanda, CRO and Bilderbuch", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "bilderbuch-2022-04-08")).toBe(false);
    expect(OTHER_CONCERTS.some((c) => c.sort.startsWith("2020-"))).toBe(false);
    const wanda = enrichmentData["wanda-2015-12-05"] as { city: string; venue: string };
    expect(wanda.city).toBe("Leipzig");
    expect(wanda.venue).toBe("Täubchenthal");
    const cro = enrichmentData["cro-2019-08-18"] as { setlist: string[] };
    expect(cro.setlist.length).toBeGreaterThan(15);
    expect(cro.setlist).toContain("unendlichkeit");
    const sting = enrichmentData["sting-2022-07-28"] as { setlist: string[]; venue: string };
    expect(sting.venue).toBe("Zitadelle Spandau");
    expect(sting.setlist).toContain("Every Breath You Take");
    const fox = enrichmentData["peter-fox-2023-06-11"] as { setlist: string[] };
    expect(fox.setlist.length).toBeGreaterThan(10);
  });

  it("includes Berlin concerts from user list with venue corrections", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "david-bowie-2002-09-22")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "madonna-2001-06-20")).toBe(true);
    const rhcp = enrichmentData["red-hot-chili-peppers-1992-03-22"] as {
      venue: string;
      tour: string;
      setlistComplete: boolean;
      note: string;
    };
    expect(rhcp.venue).toBe("Die Halle");
    expect(rhcp.tour).toBe("Blood Sugar Sex Magik Tour");
    expect(rhcp.setlistComplete).toBe(false);
    expect(rhcp.note).toMatch(/Rollins Band/i);
    expect(rhcp.note).not.toMatch(/Less Whores/i);
    const lnv = enrichmentData["les-negresses-vertes-1992-03-19"] as {
      venue: string;
      setlistComplete: boolean;
      setlist: string[];
      note: string;
    };
    expect(lnv.venue).toBe("Die Halle");
    expect(lnv.setlistComplete).toBe(false);
    expect(lnv.note).toMatch(/typische Mlah-Tour-Setlist/i);
    expect(lnv.setlist).toHaveLength(18);
    expect(lnv.setlist[0]).toBe("Quai de Jemmapes");
    expect(lnv.setlist.at(-1)).toBe("Les yeux de ton père");
    const specials2019 = enrichmentData["the-specials-2019-04-03"] as { note: string; setlist: string[] };
    expect(specials2019.note).toMatch(/Columbiahalle/i);
    expect(specials2019.setlist).toContain("Ghost Town");
    const tomJones = enrichmentData["tom-jones-2000-04-25"] as { venue: string; tour: string };
    expect(tomJones.venue).toMatch(/ICC/i);
    expect(tomJones.tour).toBe("Reload Tour");
  });

  it("includes Seeed Ferropolis 2014 with Bilderbuch support", () => {
    const seeed = enrichmentEntries()["seeed-2014-08-22"];
    expect(seeed?.acts?.some((a) => a.artistId === "bilderbuch" && (a.setlist?.length ?? 0) > 0)).toBe(true);
    expect(seeed?.acts?.some((a) => a.artistId === "janelle-monae")).toBe(true);
    expect(seeed?.acts?.some((a) => a.artistId === "seeed" && a.setlist?.includes("Augenbling"))).toBe(true);
    const iggy = enrichmentData["iggy-pop-1998-03-07"] as { venue: string; tour: string; note: string };
    expect(iggy.venue).toBe("Columbiahalle");
    expect(iggy.tour).toBe("Naughty Little Doggie Tour");
    expect(iggy.note).toMatch(/8\.3\./);
  });

  it("corrects Iggy Pop from Huxley's 1993 to Columbiahalle 1998", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "iggy-pop-1998-03-07")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "iggy-pop-1993-11-28")).toBe(false);
    const iggy = enrichmentData["iggy-pop-1998-03-07"] as { venue: string; setlist: string[] };
    expect(iggy.venue).toBe("Columbiahalle");
    expect(iggy.setlist).toContain("Lust for Life");
  });

  it("includes Tempodrom concerts from user list", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "the-pogues-1988-04-28")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "heroes-del-silencio-1992-06-14")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "heino-aid-1986-10-18")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "die-toten-hosen-1987-09-05")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "poems-for-laila-1991-07-06")).toBe(true);

    const pogues = enrichmentData["the-pogues-1988-04-28"] as {
      venue: string;
      setlistComplete: boolean;
      setlist: string[];
      note: string;
    };
    expect(pogues.venue).toBe("Tempodrom");
    expect(pogues.setlistComplete).toBe(true);
    expect(pogues.setlist).toEqual([
      "The Battle March Medley",
      "The Broad Majestic Shannon",
      "Streams of Whiskey",
      "If I Should Fall From Grace With God",
      "The Body of an American",
      "Lullaby of London",
      "Boat Train",
      "Metropolis",
      "A Rainy Night in Soho",
      "Fairytale of New York",
      "Johnny Come Lately (cover)",
      "Bottle of Smoke",
      "Streets of Sorrow/Birmingham Six",
      "Thousands Are Sailing",
      "Turkish Song of the Damned",
      "Fiesta",
      "Sally MacLennane",
      "The Sick Bed of Cúchulainn",
      "A Pair of Brown Eyes",
    ]);
    expect(pogues.note).toMatch(/Kirsty MacColl/i);

    const toyDolls = enrichmentData["the-toy-dolls-1989-10-25"] as {
      venue: string;
      tour: string;
      setlistComplete: boolean;
      setlist: string[];
      note: string;
    };
    expect(toyDolls.venue).toBe("Loft");
    expect(toyDolls.tour).toBe("Wakey Wakey! Tour");
    expect(toyDolls.setlistComplete).toBe(false);
    expect(toyDolls.setlist).toHaveLength(20);
    expect(toyDolls.setlist[0]).toBe("Wakey Wakey Intro");
    expect(toyDolls.setlist.at(-1)).toBe("Nellie the Elephant");
    expect(toyDolls.note).toMatch(/Tokyo/i);

    const heroes = enrichmentData["heroes-del-silencio-1992-06-14"] as {
      note: string;
      setlistComplete: boolean;
      setlist: string[];
    };
    expect(heroes.note).toMatch(/Quartier/i);
    expect(heroes.setlistComplete).toBe(true);
    expect(heroes.setlist).toHaveLength(11);
    expect(heroes.setlist[0]).toBe("Nuestros nombres");
    expect(heroes.setlist.at(-1)).toBe("Con nombre de guerra");

    const heinoAid = enrichmentEntries()["heino-aid-1986-10-18"];
    expect(heinoAid?.acts?.some((a) => a.artistId === "die-toten-hosen")).toBe(true);
    expect(heinoAid?.acts?.some((a) => a.artistId === "die-aerzte")).toBe(true);
    expect(heinoAid?.note).toMatch(/Benefiz/i);
    const manifest = assetManifest as { posters: Record<string, string> };
    expect(manifest.posters["heino-aid:Wir lassen uns das Singen nicht verbieten"]).toBe(
      "/posters/heino-aid--wir-lassen-uns-das-singen-nicht-verbieten.jpg",
    );

    const dth = enrichmentEntries()["die-toten-hosen-1987-09-05"];
    expect(dth?.acts?.some((a) => a.artistId === "blubbery-hellbellies")).toBe(true);
    expect(dth?.acts?.find((a) => a.artistId === "die-toten-hosen")?.setlist).toContain("Opel-Gang");

    const pfl = enrichmentData["poems-for-laila-1991-07-06"] as { venue: string; tour: string; note: string };
    expect(pfl.venue).toBe("Tempodrom");
    expect(pfl.tour).toMatch(/Fillette Triste/i);
    expect(pfl.note).toMatch(/Morgenpost/i);

    const sc = enrichmentData["soul-coughing-1997-06-01"] as { city: string; setlist: string[]; note: string };
    expect(sc.city).toBe("Berlin");
    expect(sc.setlist).toContain("Super Bon Bon");
    expect(sc.note).toMatch(/Berlin\/Amsterdam/i);

    const sbm = enrichmentData["screaming-blue-messiahs-1989-12-13"] as {
      venue: string;
      note: string;
      setlistComplete: boolean;
      setlist: string[];
    };
    expect(sbm.venue).toBe("Loft");
    expect(sbm.note).toMatch(/King Candy/i);
    expect(sbm.setlistComplete).toBe(true);
    expect(sbm.setlist).toHaveLength(15);
    expect(sbm.setlist[0]).toBe("Four Engines Burning");
    expect(sbm.setlist.at(-1)).toBe("You're Gonna Change (cover)");

    const f4 = enrichmentData["die-fantastischen-vier-2015-01-26"] as {
      venue: string;
      tour: string;
      note: string;
      setlist: string[];
    };
    expect(f4.venue).toBe("Uber Arena");
    expect(f4.tour).toBe("Rekord Tour");
    expect(f4.note).toMatch(/O2 World/i);
    expect(f4.setlist).toContain("25");
    expect(f4.setlist).toContain("MfG");

    expect(OTHER_CONCERTS.some((c) => c.id === "olli-schulz-2024-02-18")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "element-of-crime-2021-08-25")).toBe(true);
    expect(OTHER_CONCERTS.some((c) => c.id === "herbert-groenemeyer-2007-09-12")).toBe(true);

    const olli = enrichmentData["olli-schulz-2024-02-18"] as { venue: string; tour: string; setlist: string[] };
    expect(olli.venue).toBe("Tempodrom");
    expect(olli.tour).toBe("Tour 2024");
    expect(olli.setlist).toContain("So muss es beginnen");

    const eoc = enrichmentData["element-of-crime-2021-08-25"] as {
      venue: string;
      setlistComplete: boolean;
      note: string;
    };
    expect(eoc.venue).toBe("Strandkorb Open Air");
    expect(eoc.setlistComplete).toBe(false);
    expect(eoc.note).toMatch(/Hartenholm/i);

    const hg = enrichmentData["herbert-groenemeyer-2007-09-12"] as {
      venue: string;
      setlistComplete: boolean;
      note: string;
    };
    expect(hg.venue).toBe("Waldbühne");
    expect(hg.setlistComplete).toBe(false);
    expect(hg.note).toMatch(/Waldbühne/i);

    expect(OTHER_CONCERTS.some((c) => c.id === "loyle-carner-2017-03-01")).toBe(true);
    const lc = enrichmentData["loyle-carner-2017-03-01"] as {
      venue: string;
      tour: string;
      setlistComplete: boolean;
      note: string;
      setlist: string[];
    };
    expect(lc.venue).toBe("Gretchen");
    expect(lc.tour).toBe("Yesterday's Gone Tour");
    expect(lc.setlistComplete).toBe(false);
    expect(lc.note).toMatch(/Gretchen leer/i);
    expect(lc.setlist).toContain("The Isle of Arran");
  });

  it("festival support acts are not headliner artists in OTHER_CONCERTS", () => {
    const headliners = new Set(OTHER_CONCERTS.map((c) => c.artistId));
    for (const slug of ["stunde-x", "blubbery-hellbellies", "die-mimmis", "the-subtones"]) {
      expect(headliners.has(slug)).toBe(false);
    }
  });

  it("includes Konzert für Berlin 1989 with multi-act lineup", () => {
    expect(OTHER_CONCERTS.some((c) => c.id === "konzert-fuer-berlin-1989-11-12")).toBe(true);
    const kfb = enrichmentEntries()["konzert-fuer-berlin-1989-11-12"];
    expect(kfb?.venue).toBe("Deutschlandhalle");
    expect(kfb?.tour).toBe("Konzert für Berlin");
    expect(kfb?.note).toMatch(/Mauerfall/i);
    expect(kfb?.acts?.length).toBe(18);
    expect(kfb?.acts?.some((a) => a.artistId === "joe-cocker" && a.setlist?.includes("With a Little Help from My Friends"))).toBe(
      true,
    );
    expect(kfb?.acts?.find((a) => a.artistId === "bap")?.setlist).toContain("Verdamp lang her");
    expect(kfb?.acts?.find((a) => a.artistId === "die-toten-hosen")?.setlist).toContain("Hier kommt Alex");
    expect(kfb?.acts?.find((a) => a.artistId === "puhdys")?.setlist).toContain("Wunder gescheh'n");
  });
});
