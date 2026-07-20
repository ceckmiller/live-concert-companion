"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { TourPosterEditModal } from "@/components/TourPosterEditModal";
import { PosterCropFrame } from "@/components/PosterCropFrame";
import { deleteConcert, setConcertPoster } from "@/lib/actions";
import { showLongRecordingsSection, soleConcertRecording } from "@/lib/concert-display";
import { buildLyricsUrl } from "@/lib/lyrics-url";
import { setlistEntryKey } from "@/lib/setlist-keys";
import type { ArtistContext, ArtistPayload, Concert, HomePayload, SongMeta } from "@/types/domain";

const ORIGIN_LABEL: Record<string, string> = {
  morrissey: "Morrissey",
  smiths: "The Smiths",
  cover: "Cover",
  artist: "Live",
  other: "Sonstiges",
};

function posterInfo(c: Concert, tours: ArtistPayload["tours"]) {
  const t = tours[c.tour] || {};
  return {
    poster: c.poster || t.poster || "",
    crop: c.posterCrop,
    label: c.posterLabel || t.label || c.tour,
    kind: t.kind || "album",
  };
}

function renderSongMeta(song: string, meta: Record<string, SongMeta>, artistName: string) {
  const m = meta[song];
  if (!m) return null;
  let text = ORIGIN_LABEL[m.origin] || m.origin;
  if (m.origin === "cover" && m.by) text += ` (${m.by})`;
  else if (m.origin === "artist") text = artistName;
  if (m.album) text += ` · ${m.album}${m.year ? ` (${m.year})` : ""}`;
  else if (m.year) text += ` · ${m.year}`;
  return <span className={`song-meta song-origin-${m.origin}`}>{text}</span>;
}

function SongLinks({
  song,
  meta,
  artistName,
  videoUrl,
}: {
  song: string;
  meta: Record<string, SongMeta>;
  artistName: string;
  videoUrl?: string;
}) {
  const m = meta[song];
  const lyricsUrl = buildLyricsUrl(song, m, artistName);
  return (
    <span className="song-links">
      {videoUrl ? (
        <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="song-link-chip" title={`YouTube: ${song}`}>
          Video
        </a>
      ) : null}
      <a href={lyricsUrl} target="_blank" rel="noopener noreferrer" className="song-link-chip" title={`Lyrics: ${song}`}>
        Lyrics
      </a>
    </span>
  );
}

function SongLabel({
  song,
  meta,
  artistName,
  showLinks = false,
}: {
  song: string;
  meta: Record<string, SongMeta>;
  artistName: string;
  showLinks?: boolean;
}) {
  const officialVideo = meta[song]?.officialVideo;
  return (
    <span className="song-line">
      <span className="song-title">{song}</span>
      {renderSongMeta(song, meta, artistName)}
      {showLinks ? (
        <SongLinks song={song} meta={meta} artistName={artistName} videoUrl={officialVideo} />
      ) : null}
    </span>
  );
}

function SpotifyBlock({ setlistFm }: { setlistFm?: string }) {
  if (!setlistFm) return null;
  const setlistUrl = setlistFm;
  function importSpotify() {
    const openTool = () => window.open("https://setlistfm.selbi.club/", "_blank");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(setlistUrl).then(openTool).catch(openTool);
    } else openTool();
  }
  return (
    <div className="concert-spotify">
      <h3 className="body-label">Spotify-Playlist</h3>
      <div className="spotify-actions">
        <button type="button" className="spotify-btn spotify-btn-primary" onClick={importSpotify}>
          Setlist importieren
        </button>
        <a className="spotify-btn" href={setlistFm} target="_blank" rel="noopener noreferrer">
          setlist.fm öffnen
        </a>
      </div>
      <p className="spotify-hint">Kopiert die setlist.fm-URL und öffnet das Import-Tool — dort einfügen und Playlist erstellen.</p>
    </div>
  );
}

function concertSongCount(c: Concert): number {
  if (c.acts?.length) return c.acts.reduce((sum, act) => sum + act.setlist.length, 0);
  return c.setlist.length;
}

function SetlistItem({
  song,
  meta,
  artistName,
  videoUrl,
}: {
  song: string;
  meta: Record<string, SongMeta>;
  artistName: string;
  videoUrl?: string;
}) {
  const inner = <SongLabel song={song} meta={meta} artistName={artistName} />;
  if (videoUrl) {
    return (
      <li>
        <a href={videoUrl} target="_blank" rel="noopener noreferrer" title={`YouTube: ${song}`}>
          {inner}
        </a>
      </li>
    );
  }
  return <li>{inner}</li>;
}

function SetlistSection({
  songs,
  meta,
  artistName,
  videos,
}: {
  songs: string[];
  meta: Record<string, SongMeta>;
  artistName: string;
  videos?: Record<string, string>;
}) {
  if (!songs.length) {
    return <p className="section-desc">Noch keine Setlist erfasst.</p>;
  }
  return (
    <ol className="setlist">
      {songs.map((song, index) => (
        <SetlistItem
          key={setlistEntryKey(index, song)}
          song={song}
          meta={meta}
          artistName={artistName}
          videoUrl={videos?.[song]}
        />
      ))}
    </ol>
  );
}

function ConcertCard({
  c,
  data,
  openId,
  onOpen,
  showArtist = false,
  artistsBySlug,
}: {
  c: Concert;
  data: Pick<ArtistPayload, "artist" | "tours" | "songMeta">;
  openId?: string;
  onOpen: (id: string) => void;
  showArtist?: boolean;
  artistsBySlug?: HomePayload["artistsBySlug"];
}) {
  const router = useRouter();
  const [posterOpen, setPosterOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const p = posterInfo(c, data.tours);
  const artistLabel = c.artistName || data.artist.name;
  const artistHref = c.artistSlug || data.artist.slug;
  const titleRecording = soleConcertRecording(c.recordings);
  const titleText = `${c.date} — ${c.venue}`;

  function removeConcert(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Konzert „${titleText}“ wirklich entfernen?`)) return;
    startTransition(async () => {
      await deleteConcert(artistHref, c.id);
      router.refresh();
    });
  }

  return (
    <div className={`concert-wrap${openId === c.id ? " highlight" : ""}`} id={`concert-${c.id}`}>
      <details
        className="concert"
        open={openId === c.id}
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open) onOpen(c.id);
        }}
      >
        <summary>
          <div className="concert-poster">
            <button
              type="button"
              className="concert-poster-edit"
              title="Tourplakat ändern"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPosterOpen(true);
              }}
            >
              {p.poster ? (
                <PosterCropFrame src={p.poster} alt={c.tour} crop={p.crop} title={p.label} />
              ) : (
                <div className="card-placeholder">{c.tour || data.artist.name}</div>
              )}
            </button>
          </div>
          <div className="concert-head">
            {showArtist ? (
              <Link className="concert-artist" href={`/artist/${artistHref}`}>
                {artistLabel}
              </Link>
            ) : null}
            <span className="concert-title">
              {titleRecording ? (
                <a
                  href={titleRecording.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={titleRecording.title}
                  onClick={(e) => e.stopPropagation()}
                >
                  {titleText}
                </a>
              ) : (
                titleText
              )}
            </span>
            <div className="concert-meta">
              <span className="badge city">{c.city}</span>
              {c.tour && <span className="badge tour">{c.tour}</span>}
              <span className="badge">{concertSongCount(c)} Songs</span>
              <button
                type="button"
                className="concert-delete-btn"
                title="Konzert entfernen"
                disabled={pending}
                onClick={removeConcert}
              >
                entfernen
              </button>
            </div>
          </div>
          <span className="concert-toggle" />
        </summary>
        <div className="concert-body">
          {c.note && <p className="concert-note">{c.note}</p>}
          {c.reviews && c.reviews.length > 0 && (
            <div className="concert-reviews">
              <h3 className="body-label">Kritiken</h3>
              <div className="review-links">
                {c.reviews.map((r) => (
                  <a key={r.url} className="review-link" href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.title}
                    <span className="review-source">{r.source}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="setlist-block">
            <h3 className="body-label">
              Setlist{c.acts?.length ? "s" : ""}{" "}
              <span className="body-label-meta">{concertSongCount(c)} Songs</span>
            </h3>
            {c.acts?.length ? (
              c.acts.map((act) => {
                const actMeta = artistsBySlug?.[act.artistSlug]?.songMeta ?? data.songMeta;
                return (
                  <div className="setlist-act" key={`${act.artistSlug}-${act.artistName}`}>
                    <h4 className="setlist-act-head">
                      {artistsBySlug?.[act.artistSlug] || act.artistSlug !== data.artist.slug ? (
                        <Link className="setlist-act-artist" href={`/artist/${act.artistSlug}`}>
                          {act.artistName}
                        </Link>
                      ) : (
                        act.artistName
                      )}
                      <span className="body-label-meta">{act.setlist.length} Songs</span>
                    </h4>
                    {act.note ? <p className="setlist-act-note">{act.note}</p> : null}
                    <SetlistSection
                      songs={act.setlist}
                      meta={actMeta}
                      artistName={act.artistName}
                      videos={act.videos}
                    />
                    {act.setlistFm ? (
                      <p className="setlist-act-link">
                        <a href={act.setlistFm} target="_blank" rel="noopener noreferrer">
                          setlist.fm — {act.artistName}
                        </a>
                      </p>
                    ) : null}
                  </div>
                );
              })
            ) : c.setlist.length ? (
              <SetlistSection
                songs={c.setlist}
                meta={data.songMeta}
                artistName={artistLabel}
                videos={c.videos}
              />
            ) : (
              <p className="section-desc">Noch keine Setlist — setlist.fm-Link unten nutzen oder später ergänzen.</p>
            )}
          </div>
          <SpotifyBlock setlistFm={c.setlistFm} />
          {c.recordings && showLongRecordingsSection(c.recordings) && (
            <div className="concert-recordings">
              <h3 className="recordings-title">Längere Mitschnitte</h3>
              <ul>
                {c.recordings.map((r) => (
                  <li key={r.url}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.title}
                    </a>{" "}
                    <span className="video-duration">({r.duration})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
      <TourPosterEditModal
        open={posterOpen}
        onClose={() => setPosterOpen(false)}
        artistName={artistLabel}
        tourName={c.tour || artistLabel}
        city={c.city}
        year={c.sort.slice(0, 4)}
        currentPoster={p.poster}
        currentCrop={p.crop}
        onPick={async (pick) => {
          await setConcertPoster({
            artistSlug: artistHref,
            concertSlug: c.id,
            posterUrl: pick.url,
            posterTitle: pick.title,
            tourName: c.tour || artistLabel,
            posterCrop: pick.crop ?? null,
          });
          router.refresh();
        }}
      />
    </div>
  );
}

export function ConcertTimeline({
  data,
  openId,
  onOpen,
}: {
  data: ArtistPayload;
  openId?: string;
  onOpen: (id: string) => void;
}) {
  let lastYear = "";
  return (
    <div className="timeline concert-poster-stacked">
      {data.concerts.map((c) => {
        const year = c.sort.slice(0, 4);
        const marker =
          year !== lastYear ? (
            <div className="year-marker" key={`y-${year}`}>
              <span>{year}</span>
            </div>
          ) : null;
        lastYear = year;
        return (
          <div key={c.id}>
            {marker}
            <ConcertCard c={c} data={data} openId={openId} onOpen={onOpen} />
          </div>
        );
      })}
    </div>
  );
}

export function SongSection({
  data,
  onOpenConcert,
}: {
  data: ArtistPayload;
  onOpenConcert?: (id: string) => void;
}) {
  const [openSong, setOpenSong] = useState<string | null>(null);

  function toggleSong(song: string) {
    setOpenSong((current) => (current === song ? null : song));
  }

  if (!data.songs.length) return null;

  return (
    <section id="songs">
      <div className="section-head">
        <h2>Song-Häufigkeit</h2>
        <p className="section-desc">
          {data.stats.uniqueSongs} verschiedene Songs · {data.stats.totalSlots} Songs gesamt
        </p>
      </div>
      <table className="songs-table">
        <thead>
          <tr>
            <th className="num">Rang</th>
            <th>Song</th>
            <th className="cnt">×</th>
          </tr>
        </thead>
        <tbody>
          {data.songs.map((s, index) => (
            <Fragment key={s.song}>
              <tr
                className={`song-row${openSong === s.song ? " open" : ""}`}
                onClick={(e) => {
                  if (e.target instanceof Element && e.target.closest("a, button")) return;
                  toggleSong(s.song);
                }}
              >
                <td className="num">{index + 1}</td>
                <td className="song-name">
                  <SongLabel song={s.song} meta={data.songMeta} artistName={data.artist.name} showLinks />
                  {s.count > 1 ? <span className="song-hint">({s.count}×)</span> : null}
                </td>
                <td className="cnt">{s.count}</td>
              </tr>
              <tr className="song-detail" hidden={openSong !== s.song}>
                <td colSpan={3}>
                  <ul className="song-appearances">
                    {s.concerts.map((appearance) => (
                      <li key={`${appearance.id}-${appearance.pos}`}>
                        <button
                          type="button"
                          className="concert-link"
                          onClick={() => onOpenConcert?.(appearance.id)}
                        >
                          {appearance.date} — {appearance.city}, {appearance.venue}
                        </button>{" "}
                        <span className="song-hint">(Song Nr. {appearance.pos})</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function artistPayloadFromContext(ctx: ArtistContext): Pick<ArtistPayload, "artist" | "tours" | "songMeta"> {
  return { artist: ctx.artist, tours: ctx.tours, songMeta: ctx.songMeta };
}

export function GlobalConcertTimeline({
  home,
  openId,
  onOpen,
}: {
  home: HomePayload;
  openId?: string;
  onOpen: (id: string) => void;
}) {
  let lastYear = "";
  return (
    <div className="timeline concert-poster-stacked">
      {home.concerts.map((c) => {
        const year = c.sort.slice(0, 4);
        const marker =
          year !== lastYear ? (
            <div className="year-marker" key={`y-${year}`}>
              <span>{year}</span>
            </div>
          ) : null;
        lastYear = year;
        const ctx = c.artistSlug ? home.artistsBySlug[c.artistSlug] : null;
        if (!ctx) return null;
        return (
          <div key={`${c.artistSlug}-${c.id}`}>
            {marker}
            <ConcertCard
              c={c}
              data={artistPayloadFromContext(ctx)}
              openId={openId}
              onOpen={onOpen}
              showArtist
              artistsBySlug={home.artistsBySlug}
            />
          </div>
        );
      })}
    </div>
  );
}
