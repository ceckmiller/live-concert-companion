"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlobalConcertTimeline } from "@/components/ArtistSections";
import type { HomePayload } from "@/types/domain";

type HomeView = "timeline" | "artists";

const VIEW_KEY = "lkc-home-view";

export function HomePageClient({ home }: { home: HomePayload }) {
  const [view, setView] = useState<HomeView>("timeline");
  const [openConcertId, setOpenConcertId] = useState<string>();

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "timeline" || saved === "artists") setView(saved);
  }, []);

  function switchView(next: HomeView) {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  }

  function openConcert(id: string) {
    setOpenConcertId(id);
    requestAnimationFrame(() => {
      document.getElementById(`concert-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const s = home.stats;

  return (
    <main>
      <div className="stats">
        <div className="stat">
          <div className="val">{s.concerts}</div>
          <div className="lbl">Konzerte</div>
        </div>
        <div className="stat">
          <div className="val">{s.artists}</div>
          <div className="lbl">Künstler</div>
        </div>
        <div className="stat">
          <div className="val">{s.years}</div>
          <div className="lbl">Jahre</div>
        </div>
        <div className="stat">
          <div className="val">{home.concerts[0]?.sort.slice(0, 4) ?? "—"}</div>
          <div className="lbl">Neuestes</div>
        </div>
      </div>

      <div className="view-toggle" role="tablist" aria-label="Dashboard-Ansicht">
        <button
          type="button"
          role="tab"
          aria-selected={view === "timeline"}
          className={view === "timeline" ? "active" : undefined}
          onClick={() => switchView("timeline")}
        >
          Chronologie
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "artists"}
          className={view === "artists" ? "active" : undefined}
          onClick={() => switchView("artists")}
        >
          Künstler
        </button>
      </div>

      {view === "timeline" ? (
        <section id="chronologie">
          <div className="section-head">
            <h2>Chronologie</h2>
            <p className="section-desc">
              Alle Konzerte — neueste zuerst, mit Jahrestrennern. Setlists mit Album, Jahr, Video & Lyrics.
            </p>
          </div>
          <GlobalConcertTimeline home={home} openId={openConcertId} onOpen={openConcert} />
        </section>
      ) : (
        <section id="kuenstler">
          <div className="section-head">
            <h2>Alle Künstler</h2>
            <p className="section-desc">Alphabetisch — für Setlists, Song-Statistik & Tourplakate pro Künstler</p>
          </div>
          <div className="artist-list">
            {home.artists.map((a) => (
              <Link key={a.slug} className="artist-row" href={`/artist/${a.slug}`}>
                <span className="artist-row-thumb">
                  {a.image_path ? (
                    <img src={a.image_path} alt="" loading="lazy" />
                  ) : (
                    <span className="artist-row-initial">{a.name.charAt(0)}</span>
                  )}
                </span>
                <span className="artist-row-body">
                  <span className="artist-row-name">{a.name}</span>
                  <span className="artist-row-meta">
                    {a.concert_count} Konzert{a.concert_count === 1 ? "" : "e"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
