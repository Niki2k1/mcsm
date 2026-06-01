<template>
  <div
    ref="termEl"
    class="size-full min-h-0 rounded-md overflow-hidden bg-black p-2"
  />
</template>

<script setup lang="ts">
import type { Terminal } from "@xterm/xterm";

/**
 * Live server console: streams container logs (SSE) and runs typed commands
 * via RCON. Used full-page on the server detail Console tab.
 */
const props = defineProps<{
  serverId: string;
}>();

const termEl = ref<HTMLElement | null>(null);

let term: Terminal | null = null;
let fitAddon: { fit: () => void } | null = null;
let source: EventSource | null = null;
let resizeObserver: ResizeObserver | null = null;
let inputBuffer = "";

const PROMPT = "\x1b[32m>\x1b[0m ";

function writePrompt() {
  term?.write(`\r\n${PROMPT}`);
}

async function sendCommand(command: string) {
  if (!term) return;

  term.write("\r\n");
  const trimmed = command.trim();
  if (!trimmed) return writePrompt();

  try {
    const { response } = await $fetch<{ response: string }>(
      `/api/server/${props.serverId}/rcon`,
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
  term.onData(handleInput);

  // Keep the terminal sized to its container. The observer fires on the
  // initial layout and on any resize, so xterm's row count always matches the
  // visible height and the input line is never clipped.
  resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => fitAddon?.fit());
  });
  resizeObserver.observe(termEl.value);

  source = new EventSource(`/api/server/${props.serverId}/logs`);
  source.onmessage = (e) =>
    term?.write(`${e.data.replace(/\r?\n/g, "\r\n")}\r\n`);
  source.onerror = () => {
    term?.write("\r\n\x1b[33m[log stream disconnected]\x1b[0m\r\n");
    source?.close();
  };

  writePrompt();
}

function stop() {
  if (!import.meta.client) return;
  resizeObserver?.disconnect();
  resizeObserver = null;
  source?.close();
  source = null;
  term?.dispose();
  term = null;
  fitAddon = null;
  inputBuffer = "";
}

// Re-attach when the underlying container changes (a config save recreates the
// container under a new id, but Vue may reuse this component instance).
watch(
  () => props.serverId,
  () => {
    stop();
    start();
  }
);

onMounted(start);
onBeforeUnmount(stop);
</script>
