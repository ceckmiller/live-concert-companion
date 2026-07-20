"use client";

import Link from "next/link";
import { useState } from "react";
import { ConcertTimeline, SongSection } from "@/components/ArtistSections";
import type { ArtistPayload } from "@/types/domain";

export function ArtistPageClient({ data }: { data: ArtistPayload }) {
  const [openConcertId, setOpenConcertId] = useState<string>();

  function openConcert(id: string | undefined) {
    setOpenConcertId(id);
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(`concert-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const s = data.stats;

  return (
    <>
      <nav>
        <Link href="/">← Alle Künstler</Link>
        <a href="#konzerte">Konzerte</a>
        {data.songs.length > 0 ? <a href="#songs">Songs</a> : null}
      </nav>
      <main>
        <div className="stats">
          <div className="stat">
            <div className="val">{s.concerts}</div>
            <div className="lbl">Konzerte</div>
          </div>
          <div className="stat">
            <div className="val">{s.berlin}</div>
            <div className="lbl">Berlin</div>
          </div>
          <div className="stat">
            <div className="val">{s.uniqueSongs}</div>
            <div className="lbl">Songs</div>
          </div>
          <div className="stat">
            <div className="val">{s.once}</div>
            <div className="lbl">Nur 1×</div>
          </div>
        </div>
        <section id="konzerte">
          <div className="section-head">
            <h2>{data.artist.name} — Konzerte</h2>
          </div>
          <ConcertTimeline data={data} openId={openConcertId} onOpen={setOpenConcertId} />
        </section>
        <SongSection data={data} onOpenConcert={openConcert} />
      </main>
    </>
  );
}
