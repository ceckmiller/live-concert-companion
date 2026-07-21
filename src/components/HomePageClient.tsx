"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlobalConcertTimeline } from "@/components/ArtistSections";
import type { ArtistListItem, HomePayload } from "@/types/domain";

type HomeView = "timeline" | "artists";

const VIEW_KEY = "lkc-home-view";

function ArtistRows({ artists }: { artists: ArtistListItem[] }) {
  return (
    <div className="artist-list">
      {artists.map((a) => (
        <Link key={a.id} className="artist-row" href={`/artist/${a.id}`}>
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
  );
}

export function HomePageClient({ home }: { home: HomePayload }) {
  const [view, setView] = useState<HomeView>("timeline");
  const [openConcertId, setOpenConcertId] = useState<string>();
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "artists") {
      setView("artists");
      return;
    }
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "timeline" || saved === "artists") setView(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("concert-")) return;
    const id = hash.slice("concert-".length);
    if (!id) return;
    setOpenConcertId(id);
    requestAnimationFrame(() => {
      document.getElementById(`concert-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  function switchView(next: HomeView) {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  }

  function openConcert(id: string | undefined) {
    setOpenConcertId(id);
    if (!id) return;
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
          <div className="lbl">Künstler (Solo)</div>
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
        <>
          <section id="chronologie">
            <div className="section-head">
              <h2>Chronologie</h2>
              <p className="section-desc">
                Alle Konzerte &amp; Multi-Act-Events — neueste zuerst.
              </p>
            </div>
            <GlobalConcertTimeline
              concerts={home.concerts}
              artistsBySlug={home.artistsBySlug}
              openId={openConcertId}
              onOpen={openConcert}
              allowHide
            />
          </section>

          {showHidden && home.hiddenConcerts.length > 0 ? (
            <section id="ausgeblendet">
              <div className="section-head">
                <h2>Ausgeblendete Konzerte</h2>
              </div>
              <GlobalConcertTimeline
                concerts={home.hiddenConcerts}
                artistsBySlug={home.artistsBySlug}
                openId={openConcertId}
                onOpen={openConcert}
                hiddenView
              />
            </section>
          ) : null}

          {home.hiddenConcerts.length > 0 ? (
            <p className="hidden-toggle-wrap">
              <button type="button" className="hidden-toggle-link" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? "Ausgeblendete verbergen" : "Ausgeblendete einblenden"}
              </button>
            </p>
          ) : null}
        </>
      ) : (
        <>
          <section id="kuenstler-solo">
            <div className="section-head">
              <h2>Einzelkonzerte</h2>
              <p className="section-desc">
                Künstler, bei denen du auf Solo-Konzerten warst — alphabetisch
              </p>
            </div>
            <ArtistRows artists={home.artists} />
          </section>

          {home.festivalGuestArtists.length > 0 ? (
            <section id="kuenstler-festival">
              <div className="section-head">
                <h2>Nur bei Multi-Act-Events gesehen</h2>
                <p className="section-desc">
                  Künstler, die nur als Acts auf Multi-Act-Events in deiner Liste stehen
                </p>
              </div>
              <ArtistRows artists={home.festivalGuestArtists} />
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
