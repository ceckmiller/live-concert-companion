#!/usr/bin/env tsx
/**
 * Search YouTube for setlist songs of one concert and write hits to concert_videos in local DB.
 * Usage: npx tsx scripts/enrich-concert-videos-db.ts peter-fox-2024-07-26
 */
import { createClient } from "@libsql/client";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { artists, concertVideos, concerts, setlistItems } from "../src/lib/db/schema";

const slug = process.argv[2];
if (!slug) {
  console.error("Usage: npx tsx scripts/enrich-concert-videos-db.ts <concert-slug>");
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url, authToken });
const db = drizzle(client);

async function main() {
  const { findSongVideo } = await import("./search-concert-youtube.mjs");

  const concert = (
    await db
      .select({
        id: concerts.id,
        slug: concerts.slug,
        sortDate: concerts.sortDate,
        city: concerts.city,
        venue: concerts.venue,
        artistName: artists.name,
      })
      .from(concerts)
      .innerJoin(artists, eq(concerts.artistId, artists.id))
      .where(eq(concerts.slug, slug))
      .limit(1)
  )[0];

  if (!concert) {
    console.error("Concert not found:", slug);
    process.exit(1);
  }

  const songs = (
    await db
      .select()
      .from(setlistItems)
      .where(eq(setlistItems.concertId, concert.id))
      .orderBy(asc(setlistItems.position))
  ).map((row) => row.songTitle);

  console.log(`Concert: ${concert.artistName} — ${concert.sortDate} (${concert.city})`);
  console.log(`Songs: ${songs.length}`);

  let found = 0;
  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    process.stdout.write(`[${i + 1}/${songs.length}] ${song} … `);
    const hit = await findSongVideo({
      concertId: concert.slug,
      artistName: concert.artistName,
      city: concert.city,
      venue: concert.venue,
      sort: concert.sortDate,
      song,
    });
    if (hit) {
      found++;
      await db
        .insert(concertVideos)
        .values({ concertId: concert.id, songTitle: song, url: hit })
        .onConflictDoUpdate({
          target: [concertVideos.concertId, concertVideos.songTitle],
          set: { url: hit },
        });
      console.log("✓", hit);
    } else {
      console.log("—");
    }
  }

  console.log(`Done: ${found}/${songs.length} videos found.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
