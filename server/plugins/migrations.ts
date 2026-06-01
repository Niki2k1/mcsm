import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  applyDatabaseMigrations,
  applyDatabaseQueries,
} from "@nuxthub/core/db";
import * as schema from "../db/schema";

/**
 * Database bootstrap at server startup.
 *
 * 1. Production migrations — in dev NuxtHub applies migrations itself, but the
 *    prebuilt Docker image can't rely on that: the SQLite file lives on the
 *    runtime volume (`.data`), which doesn't exist at build time. The
 *    migration SQL files are bundled into the server output as Nitro server
 *    assets (see `nitro.serverAssets` in nuxt.config.ts); this plugin
 *    materialises them onto the data volume and applies whatever is pending
 *    (tracked in the `_hub_migrations` table, so this is idempotent).
 *
 * 2. Legacy import — earlier versions stored secrets/settings/domains as JSON
 *    files in the `objects` storage. If those files exist and the new tables
 *    are empty, import them once. The JSON files are left untouched as a
 *    fallback/backup.
 *
 * NOTE: the database client (`@nuxthub/db`) opens the SQLite file the moment
 * the server's module graph is evaluated — before any plugin runs. That's why
 * the `.data/db` directory must already exist when node starts (the Dockerfile
 * CMD and the package.json `start` script take care of that), and why this
 * plugin can't be the one to create it.
 */
export default defineNitroPlugin(async () => {
  const hub = useRuntimeConfig().hub;
  if (!hub?.db) return;

  const { db } = await import("@nuxthub/db");

  if (!import.meta.dev) {
    try {
      await applyProductionMigrations(hub, db);
    } catch (error) {
      console.error("[mcsm] Failed to apply database migrations:", error);
      // Without a schema nothing below can work — rethrow so the failure is
      // loud instead of every request erroring later.
      throw error;
    }
  }

  try {
    await importLegacyObjects(db);
  } catch (error) {
    console.error("[mcsm] Failed to import legacy data:", error);
  }
});

type Hub = Parameters<typeof applyDatabaseMigrations>[0];
type Db = Awaited<ReturnType<typeof importDb>>;
const importDb = async () => (await import("@nuxthub/db")).db;

async function applyProductionMigrations(hub: Hub, db: Db) {
  // Materialise the bundled migration files where NuxtHub's migration runner
  // expects them: `${hub.dir}/db/migrations`. hub.dir is the absolute path of
  // the data dir baked at build time (e.g. /app/.data in the Docker image).
  const assets = useStorage("assets:migrations");
  const targetDir = join(hub.dir, "db/migrations");

  for (const key of await assets.getKeys()) {
    if (!key.endsWith(".sql")) continue;
    const raw = await assets.getItemRaw(key);
    if (!raw) continue;
    const path = join(targetDir, key.replace(/:/g, "/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, raw);
  }

  await applyDatabaseMigrations(hub, db);
  await applyDatabaseQueries(hub, db);
}

async function importLegacyObjects(db: Db) {
  const storage = useStorage("objects");
  const { secrets, settings, domains } = schema;

  const oldSecrets =
    await storage.getItem<Record<string, string>>("secrets.json");
  if (oldSecrets && !(await db.select().from(secrets).limit(1)).length) {
    for (const [key, value] of Object.entries(oldSecrets)) {
      await db.insert(secrets).values({ key, value }).onConflictDoNothing();
    }
    console.info("[mcsm] Imported legacy secrets into the database");
  }

  const oldSettings =
    await storage.getItem<Record<string, unknown>>("settings.json");
  if (oldSettings && !(await db.select().from(settings).limit(1)).length) {
    for (const [key, value] of Object.entries(oldSettings)) {
      await db
        .insert(settings)
        .values({ key, value: JSON.stringify(value) })
        .onConflictDoNothing();
    }
    console.info("[mcsm] Imported legacy settings into the database");
  }

  const oldDomains = await storage.getItem<string[]>("domains.json");
  if (
    oldDomains?.length &&
    !(await db.select().from(domains).limit(1)).length
  ) {
    for (const domain of oldDomains) {
      await db.insert(domains).values({ domain }).onConflictDoNothing();
    }
    console.info("[mcsm] Imported legacy domains into the database");
  }
}
