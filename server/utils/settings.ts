/**
 * Small non-secret settings store (objects storage). Currently just the
 * server's public address, used to verify that a domain's DNS points here.
 */

export interface AppSettings {
  /** Public IP or hostname players reach MCSM/Infrarust at. */
  publicHost?: string;
  /** BlueMap global defaults / behaviour. */
  bluemap?: {
    /** Pre-enable BlueMap for new Paper/Fabric/Forge servers in the wizard. */
    defaultEnabled?: boolean;
    /** Default host port offered for the BlueMap webserver in the wizard. */
    defaultPort?: number;
    /**
     * Host used to build the dashboard's "Map" links. Falls back to the
     * browser's current host when empty (the map is served on the Docker host).
     */
    publicHost?: string;
  };
}

const STORAGE_KEY = "settings.json";

export const useSettings = () => {
  const storage = useStorage("objects");

  const get = async (): Promise<AppSettings> =>
    (await storage.getItem<AppSettings>(STORAGE_KEY)) ?? {};

  const set = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    const current = await get();
    const next: AppSettings = { ...current, ...patch };

    // Merge nested bluemap rather than replacing it wholesale.
    if (patch.bluemap) next.bluemap = { ...current.bluemap, ...patch.bluemap };

    // Drop empty values so they don't linger.
    if (!next.publicHost) delete next.publicHost;
    if (next.bluemap) {
      const bm = next.bluemap;
      if (!bm.defaultPort) delete bm.defaultPort;
      if (!bm.publicHost) delete bm.publicHost;
      if (Object.keys(bm).length === 0) delete next.bluemap;
    }

    await storage.setItem(STORAGE_KEY, next);
    return next;
  };

  return { get, set };
};
