"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import type { SongStat } from "@/types/domain";

export function SongsPageClient({ songs }: { songs: SongStat[] }) {
  const [openSong, setOpenSong] = useState<string>();

  return (
    <main>
      <section id="songs">
        <div className="section-head">
          <h2>Meine Songs</h2>
          <p className="section-desc">
            Songs aus den Setlists deiner Konzerte — nach Häufigkeit sortiert.
          </p>
        </div>
        {!songs.length ? (
          <p className="section-desc">Noch keine Songs — füge Konzerte mit Setlist hinzu.</p>
        ) : (
          <table className="songs-table">
            <thead>
              <tr>
                <th>Song</th>
                <th>×</th>
              </tr>
            </thead>
            <tbody>
              {songs.map((s) => (
                <Fragment key={s.song}>
                  <tr
                    className={openSong === s.song ? "open" : undefined}
                    onClick={() => setOpenSong(openSong === s.song ? undefined : s.song)}
                  >
                    <td>{s.song}</td>
                    <td>{s.count}</td>
                  </tr>
                  {openSong === s.song ? (
                    <tr className="song-detail">
                      <td colSpan={2}>
                        <ul>
                          {s.concerts.map((c) => (
                            <li key={`${c.id}-${c.pos}`}>
                              <Link className="concert-link" href={`/concert/${c.id}`}>
                                {c.date} — {c.venue || c.city}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
