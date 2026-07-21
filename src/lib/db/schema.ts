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
    /** solo | multi_act | festival_slot (legacy: festival → multi_act) */
    eventKind: text("event_kind").notNull().default("solo"),
    /** Display name for multi-act events (independent of artist rename). */
    eventTitle: text("event_title"),
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

export const posterUploads = sqliteTable("poster_uploads", {
  id: text("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  dataBase64: text("data_base64").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Maps old artist/concert slugs to stable UUIDs after rename. */
export const slugAliases = sqliteTable(
  "slug_aliases",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    oldSlug: text("old_slug").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("slug_aliases_old_slug_unique").on(t.oldSlug)],
);

/** Catalog concert slugs the user deleted — seed must never re-insert them. */
export const catalogExclusions = sqliteTable("catalog_exclusions", {
  catalogSlug: text("catalog_slug").primaryKey(),
  excludedAt: text("excluded_at").notNull(),
  reason: text("reason"),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** Optional login username (admin: "Admin"). */
    username: text("username"),
    /** scrypt$salt$hash — null for magic-link-only members. */
    passwordHash: text("password_hash"),
    /** admin | member */
    role: text("role").notNull().default("member"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    uniqueIndex("users_username_unique").on(t.username),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.token)],
);

export const magicLinks = sqliteTable(
  "magic_links",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    token: text("token").notNull(),
    invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("magic_links_token_unique").on(t.token)],
);

/** Which users attended which concert (drives personal chronology). */
export const concertAttendees = sqliteTable(
  "concert_attendees",
  {
    concertId: text("concert_id")
      .notNull()
      .references(() => concerts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.concertId, t.userId] })],
);

export type Artist = typeof artists.$inferSelect;
export type Concert = typeof concerts.$inferSelect;
export type Tour = typeof tours.$inferSelect;
export type User = typeof users.$inferSelect;
