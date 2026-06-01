import type { InjectionKey, Ref } from "vue";

/** Shape returned by GET /api/server/[id]. */
export type ServerDetail = {
  id: string;
  name: string;
  domain: string;
  running: boolean;
  config: CreateForm | null;
  containerName?: string;
  volume?: string;
  /** ISO timestamp of the current run's start (null when stopped). */
  startedAt?: string | null;
  /** ISO timestamp of container creation. */
  createdAt?: string | null;
};

/** One row from GET /api/server/[id]/activity. */
export type ActivityEvent = {
  id: number;
  volume: string;
  t: number;
  action: string;
  detail: string | null;
};

export type ServerPing = {
  status?: {
    players?: { online: number; max: number };
    description?: unknown;
    version?: { name?: string };
    /** Base64 data URI of the 64x64 server icon. */
    favicon?: string;
  };
  latency?: number;
};

type ServerDetailContext = {
  /** Container id from the route. Changes when a config edit recreates the container. */
  id: Ref<string>;
  server: Ref<ServerDetail | undefined>;
  refresh: () => Promise<void>;
  pending: Ref<boolean>;
  /** Live Minecraft ping (undefined while loading or when the server is unreachable). */
  ping: Ref<ServerPing | undefined>;
  pingStatus: Ref<"success" | "error" | "pending" | "idle">;
  refreshPing: () => Promise<void>;
  /**
   * Icon uploaded in this session (data URL). Shown in previews immediately —
   * the server itself only reports the new icon after a restart.
   */
  localFavicon: Ref<string | undefined>;
  /** The icon to display: freshly uploaded one first, then what the server reports. */
  displayFavicon: Ref<string | undefined>;
};

const injectionKey: InjectionKey<ServerDetailContext> =
  Symbol("server-detail");

/**
 * The server detail page ([id].vue) fetches the server once and provides it
 * here; tab pages/components consume it without refetching.
 */
export const provideServerDetail = (context: ServerDetailContext) => {
  provide(injectionKey, context);
  return context;
};

export const useServerDetail = () => {
  const context = inject(injectionKey);
  if (!context) {
    throw new Error(
      "useServerDetail() can only be used inside the server detail page"
    );
  }
  return context;
};
