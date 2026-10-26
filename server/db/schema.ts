import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
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
     * backup-created, backup-restored, backup-deleted,
     * pregen-started, pregen-completed, pregen-cancelled.
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
    /**
     * Tarball path inside the backup store (`mc-smp/172....tar.gz`), or
     * `restic/<snapshot id>` for restic backups.
     */
    filename: text("filename").notNull().unique(),
    /** restic | tar */
    engine: text("engine").notNull().default("tar"),
    /** Tarball size; for restic, the new data this backup added to the store. */
    sizeBytes: integer("size_bytes"),
    createdAt: integer("created_at").notNull(),
    label: text("label"),
    /** running | done | failed */
    state: text("state").notNull().default("done"),
    /** Made by the backup schedule; only these are pruned by its retention. */
    automatic: integer("automatic", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [index("backups_volume_idx").on(table.volume)]
);

/** Automatic backup schedule per server, keyed by world volume. */
export const backupSchedules = sqliteTable("backup_schedules", {
  volume: text("volume").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  intervalHours: integer("interval_hours").notNull().default(24),
  /** "HH:MM" the slots are anchored to, in `timeZone`. */
  atTime: text("at_time").notNull().default("04:00"),
  /** IANA zone of whoever saved the schedule, so "04:00" means their 04:00. */
  timeZone: text("time_zone").notNull().default("UTC"),
  /** Automatic backups to keep; older ones are deleted after each run. */
  keep: integer("keep").notNull().default(7),
  /** Skip a slot when nobody played since the last automatic backup. */
  onlyIfPlayed: integer("only_if_played", { mode: "boolean" })
    .notNull()
    .default(true),
  /** When the schedule was last saved; slots before it are never caught up. */
  updatedAt: integer("updated_at").notNull(),
  lastRunAt: integer("last_run_at"),
  /** done | skipped | failed */
  lastResult: text("last_result"),
  lastError: text("last_error"),
});

/**
 * Current world pre-generation (Chunky) task per server — one row per volume.
 * This is a live snapshot, not a history; completed/cancelled runs are recorded
 * as activity events.
 */
export const pregenTasks = sqliteTable("pregen_tasks", {
  /** World volume name — stable server identity. */
  volume: text("volume").primaryKey(),
  /** idle | running | paused | completed | cancelled | failed */
  state: text("state").notNull().default("idle"),
  /** Requested square radius around the center, in blocks. */
  radius: integer("radius").notNull().default(0),
  /** Center of the pre-generated area, in blocks. */
  centerX: integer("center_x").notNull().default(0),
  centerZ: integer("center_z").notNull().default(0),
  /** Latest progress snapshot reported by `chunky progress`. */
  processedChunks: integer("processed_chunks").notNull().default(0),
  totalChunks: integer("total_chunks"),
  percent: real("percent").notNull().default(0),
  /** Generation rate in chunks per second. */
  rate: real("rate"),
  etaSeconds: integer("eta_seconds"),
  /** Chunk position Chunky is currently working on. */
  currentX: integer("current_x"),
  currentZ: integer("current_z"),
  startedAt: integer("started_at"),
  updatedAt: integer("updated_at").notNull(),
  completedAt: integer("completed_at"),
});

/**
 * Dashboard accounts. The first account is created by the first-run setup
 * wizard (and is always an admin); admins create further users from the
 * Admin panel — there is no open registration.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** Scrypt hash (nuxt-auth-utils hashPassword). Null = OAuth/passkey-only account. */
  password: text("password"),
  admin: integer("admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

/** WebAuthn (passkey) credentials, many per user. */
export const credentials = sqliteTable(
  "credentials",
  {
    /** Credential id as reported by the authenticator (base64url). */
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Friendly label, e.g. "MacBook Touch ID". */
    name: text("name"),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    backedUp: integer("backed_up", { mode: "boolean" })
      .notNull()
      .default(false),
    /** JSON array of WebAuthn transports, e.g. ["internal","hybrid"]. */
    transports: text("transports"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("credentials_user_id_idx").on(table.userId)]
);

/**
 * Which servers a non-admin user can see and what they may do there. Keyed by
 * world volume (not container id) so grants survive config edits. No row =
 * no access; admins bypass this table entirely.
 */
export const serverAccess = sqliteTable(
  "server_access",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    volume: text("volume").notNull(),
    /** viewer | operator | manager (see shared/utils/serverRoles.ts) */
    role: text("role").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.volume] }),
    index("server_access_volume_idx").on(table.volume),
  ]
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

/**
 * Personal access tokens for the MCP endpoint (scripts and clients that can't
 * run the OAuth flow). Only the sha256 is stored; the token is shown once.
 */
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** First characters of the token, so users can tell tokens apart. */
    prefix: text("prefix").notNull(),
    /** MCP scopes (see shared/utils/mcpScopes.ts). */
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at"),
  },
  (table) => [index("api_tokens_user_id_idx").on(table.userId)]
);

/**
 * OAuth 2.1 clients. MCP hosts register themselves through dynamic client
 * registration; registering grants nothing until a user consents.
 */
export const oauthClients = sqliteTable("oauth_clients", {
  /** client_id */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Null for public (PKCE-only) clients. */
  secretHash: text("secret_hash"),
  redirectUris: text("redirect_uris", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  /** none | client_secret_basic | client_secret_post */
  tokenEndpointAuthMethod: text("token_endpoint_auth_method")
    .notNull()
    .default("none"),
  clientUri: text("client_uri"),
  logoUri: text("logo_uri"),
  createdAt: integer("created_at").notNull(),
});

/** Short-lived, single-use authorization codes (PKCE S256). */
export const oauthAuthorizationCodes = sqliteTable(
  "oauth_authorization_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    codeChallenge: text("code_challenge").notNull(),
    expiresAt: integer("expires_at").notNull(),
  }
);

/** A user's consent for one client — one row per (client, user). */
export const oauthGrants = sqliteTable(
  "oauth_grants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at"),
    revokedAt: integer("revoked_at"),
  },
  (table) => [
    uniqueIndex("oauth_grants_client_user_idx").on(
      table.clientId,
      table.userId
    ),
  ]
);

/** Opaque access and refresh tokens issued for a grant (sha256 only). */
export const oauthTokens = sqliteTable(
  "oauth_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tokenHash: text("token_hash").notNull().unique(),
    /** access | refresh */
    kind: text("kind").notNull(),
    grantId: integer("grant_id")
      .notNull()
      .references(() => oauthGrants.id, { onDelete: "cascade" }),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (table) => [index("oauth_tokens_grant_id_idx").on(table.grantId)]
);
