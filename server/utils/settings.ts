/**
 * Small non-secret settings store (objects storage). Currently just the
 * server's public address, used to verify that a domain's DNS points here.
 */

export interface AppSettings {
  /** Public IP or hostname players reach MCSM/Infrarust at. */
  publicHost?: string;
}

const STORAGE_KEY = "settings.json";

export const useSettings = () => {
  const storage = useStorage("objects");

  const get = async (): Promise<AppSettings> =>
    (await storage.getItem<AppSettings>(STORAGE_KEY)) ?? {};

  const set = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    const next = { ...(await get()), ...patch };
    // Drop empty values so they don't linger.
    if (!next.publicHost) delete next.publicHost;
    await storage.setItem(STORAGE_KEY, next);
    return next;
  };

  return { get, set };
};
