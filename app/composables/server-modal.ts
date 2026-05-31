type ServerModalState = {
  open: boolean;
  mode: "create" | "edit";
  serverId: string | null;
};

/**
 * Drives the shared create/edit server modal. The same wizard is reused for
 * both: create starts from defaults, edit loads the server's stored config.
 */
export const useServerModal = () => {
  const state = useState<ServerModalState>("server-modal", () => ({
    open: false,
    mode: "create",
    serverId: null,
  }));

  async function openCreate() {
    // Seed BlueMap defaults from the global settings so new servers start with
    // the admin's preferred toggle/port.
    let seed: Partial<CreateForm> = {};
    try {
      const settings = await $fetch<{
        bluemap?: { defaultEnabled?: boolean; defaultPort?: number };
      }>("/api/admin/settings");
      if (settings?.bluemap) {
        seed = {
          BLUEMAP: settings.bluemap.defaultEnabled ?? false,
          BLUEMAP_PORT: settings.bluemap.defaultPort ?? 8100,
        };
      }
    } catch {
      // Settings unavailable — fall back to the form defaults.
    }
    setCreateForm(seed);
    state.value = { open: true, mode: "create", serverId: null };
  }

  async function openEdit(id: string) {
    const server = await $fetch<{ config: CreateForm | null }>(
      `/api/server/${id}`
    );
    setCreateForm(server.config);
    state.value = { open: true, mode: "edit", serverId: id };
  }

  function close() {
    state.value.open = false;
  }

  return { state, openCreate, openEdit, close };
};
