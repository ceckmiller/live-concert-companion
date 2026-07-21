"use client";

import { useState } from "react";
import { ConcertCard } from "@/components/ArtistSections";
import type { ConcertPayload } from "@/types/domain";

export function ConcertPageClient({ data }: { data: ConcertPayload }) {
  const [openId, setOpenId] = useState<string | undefined>(data.concert.id);

  return (
    <section id="konzert">
      <div className="section-head">
        <h2>
          {data.concert.eventTitle || data.artist.name}
          {data.concert.eventKind === "multi_act" ? " — Multi-Act" : ""}
        </h2>
        <p className="section-desc">
          {data.concert.date} · {data.concert.city}
          {data.concert.venue ? `, ${data.concert.venue}` : ""}
        </p>
      </div>
      <div className="timeline concert-poster-stacked">
        <ConcertCard
          c={data.concert}
          data={{
            artist: data.artist,
            tours: data.tours,
            songMeta: data.songMeta,
          }}
          openId={openId}
          onOpen={setOpenId}
          showArtist
          artistsBySlug={data.artistsBySlug}
        />
      </div>
    </section>
  );
}
