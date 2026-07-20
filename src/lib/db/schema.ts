import { sqliteTable, text, integer, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";

export const artists = sqliteTable(
  "artists",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    imagePath: text("image_path"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("artists_slug_unique").on(t.slug)],
);

export const tours = sqliteTable(
  "tours",
  {
    id: text("id").primaryKey(),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    posterPath: text("poster_path"),
    label: text("label"),
    kind: text("kind").notNull().default("album"),
  },
  (t) => [uniqueIndex("tours_artist_name_unique").on(t.artistId, t.name)],
);

export const concerts = sqliteTable(
  "concerts",
  {
    id: text("id").primaryKey(),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sortDate: text("sort_date").notNull(),
    dateLabel: text("date_label").notNull(),
    city: text("city").notNull().default(""),
    venue: text("venue").notNull().default(""),
    tourName: text("tour_name").notNull().default(""),
    note: text("note"),
    posterPath: text("poster_path"),
    posterCropJson: text("poster_crop_json"),
    posterLabel: text("poster_label"),
    setlistFmUrl: text("setlist_fm_url"),
    ticketImagePath: text("ticket_image_path"),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("concerts_artist_slug_unique").on(t.artistId, t.slug)],
);

export const setlistItems = sqliteTable(
  "setlist_items",
  {
    concertId: text("concert_id")
      .notNull()
      .references(() => concerts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    songTitle: text("song_title").notNull(),
  },
  (t) => [primaryKey({ columns: [t.concertId, t.position] })],
);

export const songMeta = sqliteTable(
  "song_meta",
  {
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    songTitle: text("song_title").notNull(),
    origin: text("origin").notNull().default("artist"),
    album: text("album"),
    year: integer("year"),
    coverBy: text("cover_by"),
    officialVideoUrl: text("official_video_url"),
  },
  (t) => [primaryKey({ columns: [t.artistId, t.songTitle] })],
);

export const concertVideos = sqliteTable(
  "concert_videos",
  {
    concertId: text("concert_id")
      .notNull()
      .references(() => concerts.id, { onDelete: "cascade" }),
    songTitle: text("song_title").notNull(),
    url: text("url").notNull(),
  },
  (t) => [primaryKey({ columns: [t.concertId, t.songTitle] })],
);

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  concertId: text("concert_id")
    .notNull()
    .references(() => concerts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  source: text("source").notNull().default(""),
});

export const recordings = sqliteTable("recordings", {
  id: text("id").primaryKey(),
  concertId: text("concert_id")
    .notNull()
    .references(() => concerts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  duration: text("duration").notNull().default(""),
});

/** Multi-artist festival sets (e.g. Peace x Peace). */
export const concertActs = sqliteTable("concert_acts", {
  id: text("id").primaryKey(),
  concertId: text("concert_id")
    .notNull()
    .references(() => concerts.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  artistSlug: text("artist_slug").notNull(),
  artistName: text("artist_name").notNull(),
  setlistFmUrl: text("setlist_fm_url"),
  note: text("note"),
  setlistComplete: integer("setlist_complete", { mode: "boolean" }).notNull().default(true),
  setlistJson: text("setlist_json").notNull(),
  videosJson: text("videos_json").notNull().default("{}"),
});

export type Artist = typeof artists.$inferSelect;
export type Concert = typeof concerts.$inferSelect;
export type Tour = typeof tours.$inferSelect;
