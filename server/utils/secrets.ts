import { eq } from "drizzle-orm";
import { secrets } from "../db/schema";

/**
 * Global secret store.
 *
 * Some settings — API keys in particular — are the same for every server and a
 * pain to re-enter per container. We keep them in one place (the SQLite
 * database on the mcsm-data volume) and inject them into containers at
 * provision time, so changing one value and re-applying updates every server.
 *
 * Values are write-only over the API: the UI can set or clear a secret and see
 * a masked preview, but the raw value is never sent back to the client.
 */

export interface SecretDef {
  /** Storage key and the canonical name shown in the UI. */
  key: string;
  label: string;
  description: string;
  /** Where to get the value (shown as a help link in the UI). */
  docsUrl?: string;
  /** itzg env var this maps to, for documentation. */
  envVar?: string;
  /** Server types affected, so the UI can say what uses it. */
  appliesTo?: string[];
}

/** The known secrets. Extend this list to expose more global API keys. */
export const SECRET_DEFS: SecretDef[] = [
  {
    key: "CURSEFORGE_API_KEY",
    label: "CurseForge API Key",
    description:
      "Lets CurseForge modpack servers download packs from the CurseForge API.",
    docsUrl: "https://console.curseforge.com/",
    envVar: "CF_API_KEY",
    appliesTo: ["AUTO_CURSEFORGE"],
  },
];

export function isKnownSecret(key: string): boolean {
  return SECRET_DEFS.some((def) => def.key === key);
}

/** Masked preview for display, e.g. `••••••3f9c`. Never returns the raw value. */
export function maskSecret(value: string): string {
  if (!value) return "";
  const tail = value.slice(-4);
  return "••••••" + tail;
}

export const useSecrets = () => {
  const getAll = async (): Promise<Record<string, string>> => {
    const rows = await db.select().from(secrets);
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  };

  const get = async (key: string): Promise<string | undefined> => {
    const row = await db
      .select()
      .from(secrets)
      .where(eq(secrets.key, key))
      .get();
    return row?.value;
  };

  const set = async (key: string, value: string) => {
    await db
      .insert(secrets)
      .values({ key, value })
      .onConflictDoUpdate({ target: secrets.key, set: { value } });
  };

  const remove = async (key: string) => {
    await db.delete(secrets).where(eq(secrets.key, key));
  };

  return { getAll, get, set, remove };
};
