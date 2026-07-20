#!/usr/bin/env tsx
/** Push enrichment JSON (acts videos + flat videos + recordings) into Turso for given concert ids. */
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import enrichmentData from "../data/other-concerts-enrichment.json" with { type: "json" };
import concertLiveVideos from "../data/concert-live-videos.json" with { type: "json" };
import concertRecordingsFound from "../data/concert-recordings-found.json" with { type: "json" };
import { CONCERT_RECORDINGS } from "./concert-recordings-other.mjs";
import { concertActs, concertVideos, concerts, recordings, setlistItems } from "../src/lib/db/schema";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: npx tsx scripts/sync-enrichment-to-db.ts <concert-id> …");
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url, authToken });
const db = drizzle(client);

async function main() {
  for (const concertId of ids) {
    const enrichment = enrichmentData[concertId as keyof typeof enrichmentData];
    if (!enrichment) {
      console.warn("No enrichment for", concertId);
      continue;
    }

    const concert = (
      await db.select().from(concerts).where(eq(concerts.slug, concertId)).limit(1)
    )[0];
    if (!concert) {
      console.warn("Concert not in DB:", concertId);
      continue;
    }

    const flatLive = (concertLiveVideos as Record<string, Record<string, string>>)[concertId] ?? {};

    if (enrichment.acts?.length) {
      const acts = await db
        .select()
        .from(concertActs)
        .where(eq(concertActs.concertId, concert.id));
      for (const actRow of acts) {
        const act = enrichment.acts.find((a) => a.artistId === actRow.artistSlug);
        if (!act) continue;
        const setlist = JSON.parse(actRow.setlistJson) as string[];
        const videos = {
          ...(act.videos ?? {}),
          ...Object.fromEntries(setlist.filter((s) => flatLive[s]).map((s) => [s, flatLive[s]])),
        };
        await db
          .update(concertActs)
          .set({ videosJson: JSON.stringify(videos) })
          .where(eq(concertActs.id, actRow.id));
        console.log(concertId, act.artistName, Object.keys(videos).length, "videos");
      }
    } else {
      const setlist = (
        await db.select().from(setlistItems).where(eq(setlistItems.concertId, concert.id))
      ).map((r) => r.songTitle);
      const videos = {
        ...(enrichment.videos ?? {}),
        ...Object.fromEntries(setlist.filter((s) => flatLive[s]).map((s) => [s, flatLive[s]])),
      };
      for (const [song, url] of Object.entries(videos)) {
        await db
          .insert(concertVideos)
          .values({ concertId: concert.id, songTitle: song, url })
          .onConflictDoUpdate({
            target: [concertVideos.concertId, concertVideos.songTitle],
            set: { url },
          });
      }
      console.log(concertId, Object.keys(videos).length, "setlist videos");
    }

    const recs = [
      ...(CONCERT_RECORDINGS[concertId as keyof typeof CONCERT_RECORDINGS] || []),
      ...((concertRecordingsFound as Record<string, { title: string; url: string; duration: string }[]>)[
        concertId
      ] || []),
      ...((enrichment as { recordings?: { title: string; url: string; duration: string }[] }).recordings || []),
    ];

    if (recs.length) {
      await db.delete(recordings).where(eq(recordings.concertId, concert.id));
      for (const rec of recs) {
        await db.insert(recordings).values({
          id: crypto.randomUUID(),
          concertId: concert.id,
          title: rec.title,
          url: rec.url,
          duration: rec.duration || "",
        });
      }
      console.log(concertId, recs.length, "recordings");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
