<template>
  <UModal
    v-model:open="state.open"
    :title="`Console — ${state.server?.name ?? ''}`"
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <div
        ref="termEl"
        class="h-[60vh] w-full rounded-md overflow-hidden bg-black p-2"
      />
      <p class="mt-2 text-xs text-muted">
        Streaming the server console. Type a command and press Enter to run it
        via RCON (the server must be running).
      </p>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { Terminal } from "@xterm/xterm";

const { state } = useConsoleModal();

const termEl = ref<HTMLElement | null>(null);

let term: Terminal | null = null;
let fitAddon: { fit: () => void } | null = null;
let source: EventSource | null = null;
let inputBuffer = "";

const PROMPT = "\x1b[32m>\x1b[0m ";

function writePrompt() {
  term?.write(`\r\n${PROMPT}`);
}

async function sendCommand(command: string) {
  const server = state.value.server;
  if (!term || !server) return;

  term.write("\r\n");
  const trimmed = command.trim();
  if (!trimmed) return writePrompt();

  try {
    const { response } = await $fetch<{ response: string }>(
      `/api/server/${server.id}/rcon`,
      { method: "POST", body: { command: trimmed } }
    );
    if (response) term.write(response.replace(/\r?\n/g, "\r\n"));
  } catch (error: unknown) {
    const status = (error as { statusCode?: number })?.statusCode;
    const message =
      status === 409 ? "Server is not running." : "RCON command failed.";
    term.write(`\x1b[31m${message}\x1b[0m`);
  }

  writePrompt();
}

function handleInput(data: string) {
  if (!term) return;
  for (const char of data) {
    if (char === "\r") {
      const command = inputBuffer;
      inputBuffer = "";
      sendCommand(command);
    } else if (char === "\u007f") {
      if (inputBuffer.length > 0) {
        inputBuffer = inputBuffer.slice(0, -1);
        term.write("\b \b");
      }
    } else if (char >= " ") {
      inputBuffer += char;
      term.write(char);
    }
  }
}

function onResize() {
  fitAddon?.fit();
}

async function start() {
  if (!import.meta.client) return;
  await nextTick();
  if (!termEl.value || term) return;

  const { Terminal } = await import("@xterm/xterm");
  const { FitAddon } = await import("@xterm/addon-fit");

  term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    theme: { background: "#000000" },
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon as never);
  term.open(termEl.value);
  fitAddon.fit();
  setTimeout(() => fitAddon?.fit(), 100);
  term.onData(handleInput);

  const server = state.value.server!;
  source = new EventSource(`/api/server/${server.id}/logs`);
  source.onmessage = (e) =>
    term?.write(`${e.data.replace(/\r?\n/g, "\r\n")}\r\n`);
  source.onerror = () => {
    term?.write("\r\n\x1b[33m[log stream disconnected]\x1b[0m\r\n");
    source?.close();
  };

  writePrompt();
  window.addEventListener("resize", onResize);
}

function stop() {
  if (!import.meta.client) return;
  window.removeEventListener("resize", onResize);
  source?.close();
  source = null;
  term?.dispose();
  term = null;
  fitAddon = null;
  inputBuffer = "";
}

watch(
  () => state.value.open,
  (open) => (open ? start() : stop())
);

onBeforeUnmount(stop);
</script>
