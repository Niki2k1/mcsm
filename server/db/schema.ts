import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";

/**
 * Database schema (NuxtHub + Drizzle, SQLite).
 *
 * Servers themselves are NOT stored here — Docker labels stay the source of
 * truth for server configs. Rows that relate to a server are keyed by its
 * world **volume name** (e.g. `mc-my-server`): the container id changes every
 * time a server's config is saved (the container is recreated), but the volume
 * is reused, so it is the only identifier that survives edits.
 */

/** Time-series samples collected by the background stats sampler. */
export const statsSamples = sqliteTable(
  "stats_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** World volume name — stable server identity. */
    volume: text("volume").notNull(),
    /** Sample timestamp (ms since epoch). */
    t: integer("t").notNull(),
    /** CPU usage in percent (can exceed 100 on multi-core). */
    cpu: real("cpu"),
    /** Memory usage / limit in bytes. */
    memUsed: integer("mem_used"),
    memLimit: integer("mem_limit"),
    /** Cumulative network I/O in bytes. */
    netRx: integer("net_rx"),
    netTx: integer("net_tx"),
    /** Minecraft ping results (null when the server is unreachable). */
    players: integer("players"),
    maxPlayers: integer("max_players"),
    latency: integer("latency"),
  },
  (table) => [index("stats_samples_volume_t_idx").on(table.volume, table.t)]
);

/** Server lifecycle events recorded by MCSM (created, started, edited, ...). */
export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    volume: text("volume").notNull(),
    /** Event timestamp (ms since epoch). */
    t: integer("t").notNull(),
    /**
     * One of: created, started, stopped, restarted, edited, deleted,
     * backup-created, backup-restored, backup-deleted.
     */
    action: text("action").notNull(),
    /** Optional human-readable detail (e.g. what changed). */
    detail: text("detail"),
  },
  (table) => [index("activity_events_volume_t_idx").on(table.volume, table.t)]
);

/** Metadata for world backups (the tarballs live on the mcsm-backups volume). */
export const backups = sqliteTable(
  "backups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    volume: text("volume").notNull(),
    /** Tarball filename inside the mcsm-backups volume, e.g. `mc-smp/172....tar.gz`. */
    filename: text("filename").notNull().unique(),
    sizeBytes: integer("size_bytes"),
    createdAt: integer("created_at").notNull(),
    label: text("label"),
    /** running | done | failed */
    state: text("state").notNull().default("done"),
  },
  (table) => [index("backups_volume_idx").on(table.volume)]
);

/** Global secrets (API keys) injected into containers at provision time. */
export const secrets = sqliteTable("secrets", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Small non-secret app settings (key/value JSON strings). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Domains servers can be created under. */
export const domains = sqliteTable("domains", {
  domain: text("domain").primaryKey(),
});
