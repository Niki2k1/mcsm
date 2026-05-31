export type ServerSaved = { id: string; name: string; domain: string };

type ServerModalState = {
  open: boolean;
  mode: "create" | "edit";
  serverId: string | null;
  /**
   * Called after a successful create/save. Editing recreates the container
   * (new id), so callers that route by id — e.g. the details page — use this
   * to follow the server to its new id.
   */
  onSaved: ((result: ServerSaved) => void) | null;
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
    onSaved: null,
  }));

  function openCreate() {
    setCreateForm();
    state.value = {
      open: true,
      mode: "create",
      serverId: null,
      onSaved: null,
    };
  }

  async function openEdit(
    id: string,
    onSaved?: (result: ServerSaved) => void
  ) {
    const server = await $fetch<{ config: CreateForm | null }>(
      `/api/server/${id}`
    );
    setCreateForm(server.config);
    state.value = {
      open: true,
      mode: "edit",
      serverId: id,
      onSaved: onSaved ?? null,
    };
  }

  function close() {
    state.value.open = false;
  }

  return { state, openCreate, openEdit, close };
};
