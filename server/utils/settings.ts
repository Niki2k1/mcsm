import { eq } from "drizzle-orm";
import { settings } from "../db/schema";

/**
 * Small non-secret settings store (SQLite, one row per key with a JSON value).
 * Currently just the server's public address, used to verify that a domain's
 * DNS points here.
 */

export interface AppSettings {
  /** Public IP or hostname players reach MCSM/Infrarust at. */
  publicHost?: string;
}

export const useSettings = () => {
  const get = async (): Promise<AppSettings> => {
    const rows = await db.select().from(settings);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return result as AppSettings;
  };

  const set = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    for (const [key, value] of Object.entries(patch)) {
      // Drop empty values so they don't linger.
      if (value === undefined || value === null || value === "") {
        await db.delete(settings).where(eq(settings.key, key));
        continue;
      }
      const serialized = JSON.stringify(value);
      await db
        .insert(settings)
        .values({ key, value: serialized })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: serialized },
        });
    }
    return get();
  };

  return { get, set };
};
