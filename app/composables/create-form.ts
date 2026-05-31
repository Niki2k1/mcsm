export type CreateForm = {
  type: string | null;
  name: string | null;
  domain: string | null;
  subdomain: string | null;
  VERSION: string | null;
  memory: string | null;
  MOTD: string;
  DIFFICULTY: "peaceful" | "easy" | "normal" | "hard";
  HARDCORE: boolean;
  MAX_PLAYERS: number;
  ONLINE_MODE: boolean;
  ALLOW_FLIGHT: boolean;
  operators: { name: string; uuid: string }[];
  whitelist: { name: string; uuid: string }[];
  LEVEL: string;
  FTB_MODPACK_ID: string | null;
  FTB_MODPACK_VERSION_ID: string | null;
  CF_SLUG: string | null;
  CF_API_KEY: string | null;
  CF_FILE_ID: string | null;
};

export const defaultCreateForm = (): CreateForm => ({
  type: null,
  name: null,
  domain: null,
  subdomain: null,
  VERSION: null,
  memory: "2GB",
  MOTD: "",
  DIFFICULTY: "normal",
  MAX_PLAYERS: 20,
  ONLINE_MODE: true,
  ALLOW_FLIGHT: false,
  operators: [],
  whitelist: [],
  HARDCORE: false,
  LEVEL: "world",
  FTB_MODPACK_ID: null,
  FTB_MODPACK_VERSION_ID: null,
  CF_SLUG: null,
  CF_API_KEY: null,
  CF_FILE_ID: null,
});

export const useCreateForm = () => {
  return useState<CreateForm>("form", () => defaultCreateForm());
};

/** Reset the shared form to defaults (create) or to an existing config (edit). */
export const setCreateForm = (initial?: Partial<CreateForm> | null) => {
  const form = useCreateForm();
  form.value = { ...defaultCreateForm(), ...(initial ?? {}) };
};
