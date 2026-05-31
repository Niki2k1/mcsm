type IconModalState = {
  open: boolean;
  server: { id: string; name: string } | null;
};

/** Drives the per-server "Server Icon" upload modal. */
export const useIconModal = () => {
  const state = useState<IconModalState>("icon-modal", () => ({
    open: false,
    server: null,
  }));

  function open(server: { id: string; name: string }) {
    state.value = { open: true, server };
  }

  function close() {
    state.value.open = false;
  }

  return { state, open, close };
};
