/**
 * Global secret store.
 *
 * Some settings — API keys in particular — are the same for every server and a
 * pain to re-enter per container. We keep them in one place (the `objects`
 * storage on the mcsm-data volume) and inject them into containers at
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

const STORAGE_KEY = "secrets.json";

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
  const storage = useStorage("objects");

  const getAll = async (): Promise<Record<string, string>> =>
    (await storage.getItem<Record<string, string>>(STORAGE_KEY)) ?? {};

  const get = async (key: string): Promise<string | undefined> =>
    (await getAll())[key];

  const set = async (key: string, value: string) => {
    const all = await getAll();
    all[key] = value;
    await storage.setItem(STORAGE_KEY, all);
  };

  const remove = async (key: string) => {
    const all = await getAll();
    delete all[key];
    await storage.setItem(STORAGE_KEY, all);
  };

  return { getAll, get, set, remove };
};
