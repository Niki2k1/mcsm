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

  function openCreate() {
    setCreateForm();
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
