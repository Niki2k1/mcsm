type ConsoleModalState = {
  open: boolean;
  server: { id: string; name: string; running: boolean } | null;
};

/** Drives the server console (log stream + RCON) modal. */
export const useConsoleModal = () => {
  const state = useState<ConsoleModalState>("console-modal", () => ({
    open: false,
    server: null,
  }));

  function open(server: { id: string; name: string; running: boolean }) {
    state.value = { open: true, server };
  }

  function close() {
    state.value.open = false;
  }

  return { state, open, close };
};
