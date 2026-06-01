<template>
  <div class="space-y-6">
    <!-- Loading -->
    <UCard v-if="!status">
      <div class="py-10 text-center text-sm text-muted">
        <UIcon
          name="i-heroicons-arrow-path-20-solid"
          class="size-6 mx-auto animate-spin opacity-60"
        />
      </div>
    </UCard>

    <!-- Unsupported server type -->
    <UCard v-else-if="!status.supported">
      <div class="text-sm text-muted py-10 text-center space-y-2">
        <UIcon
          name="i-heroicons-globe-alt"
          class="size-8 mx-auto opacity-60"
        />
        <p class="font-medium text-highlighted">
          Pre-generation isn't available for this server type
        </p>
        <p class="max-w-md mx-auto">
          World pre-generation uses the Chunky plugin, which needs a server
          that can load plugins or mods — Paper, Fabric, Forge or a CurseForge
          modpack.
        </p>
      </div>
    </UCard>

    <!-- Supported, but Chunky not installed yet -->
    <UCard v-else-if="!status.chunkyInstalled">
      <div class="text-sm py-10 text-center space-y-4">
        <UIcon
          name="i-heroicons-globe-alt"
          class="size-8 mx-auto text-muted opacity-60"
        />
        <div class="space-y-2">
          <p class="font-medium text-highlighted">World pre-generation</p>
          <p class="max-w-md mx-auto text-muted">
            Generate the world's chunks ahead of time so players never hit
            ungenerated terrain — no lag spikes while exploring. Powered by the
            <ULink
              to="https://modrinth.com/mod/chunky"
              target="_blank"
              class="underline"
              >Chunky</ULink
            >
            plugin, installed automatically.
          </p>
        </div>
        <UAlert
          icon="i-heroicons-information-circle"
          color="info"
          variant="soft"
          class="max-w-md mx-auto text-left"
          title="The server restarts once"
          description="Enabling pre-generation adds Chunky to the server's mods and recreates the container. The world is not affected."
        />
        <UButton
          icon="i-heroicons-arrow-down-on-square-20-solid"
          size="lg"
          :loading="enabling"
          @click="enable"
        >
          Enable pre-generation
        </UButton>
      </div>
    </UCard>

    <!-- Full pre-generation UI -->
    <UCard v-else>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">World pre-generation</h3>
            <p class="text-sm text-muted">
              Generates the overworld in an expanding square around the center,
              just like the vanilla world-loading screen.
            </p>
          </div>
          <UBadge :color="stateBadge.color" variant="soft" size="lg">
            <UIcon
              v-if="displayState === 'running'"
              name="i-heroicons-arrow-path-20-solid"
              class="animate-spin"
            />
            {{ stateBadge.label }}
          </UBadge>
        </div>
      </template>

      <div class="space-y-6">
        <!-- Server offline hint -->
        <UAlert
          v-if="!server?.running"
          icon="i-heroicons-exclamation-triangle"
          color="warning"
          variant="soft"
          title="Server is not running"
          :description="
            hasActiveTask
              ? 'Pre-generation is paused while the server is offline. Chunky resumes the task when the server starts.'
              : 'Start the server to begin pre-generation.'
          "
        />
        <!-- Chunky still installing hint -->
        <UAlert
          v-else-if="installing"
          icon="i-heroicons-arrow-down-circle"
          color="info"
          variant="soft"
          title="Chunky is installing"
          description="The server is downloading Chunky on this boot. Pre-generation can start as soon as it's loaded — usually under a minute."
        />

        <!-- Setup controls (no active task) -->
        <div v-if="!hasActiveTask" class="flex flex-wrap items-end gap-4">
          <UFormField
            label="Radius"
            :hint="`≈ ${radiusToChunks(form.radius).toLocaleString()} chunks`"
          >
            <UInput
              v-model.number="form.radius"
              type="number"
              :min="100"
              :max="100000"
              :step="100"
              :disabled="starting"
            >
              <template #trailing>
                <span class="text-xs text-muted">blocks</span>
              </template>
            </UInput>
          </UFormField>
          <UFormField label="Center X">
            <UInput
              v-model.number="form.centerX"
              type="number"
              class="w-28"
              :disabled="starting"
            />
          </UFormField>
          <UFormField label="Center Z">
            <UInput
              v-model.number="form.centerZ"
              type="number"
              class="w-28"
              :disabled="starting"
            />
          </UFormField>
          <UButton
            icon="i-heroicons-play-20-solid"
            color="success"
            :loading="starting"
            :disabled="!server?.running"
            @click="start"
          >
            Start pre-generation
          </UButton>
        </div>

        <!-- Active task: progress + controls -->
        <div v-else class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2">
              <div>
                <p class="text-xs text-muted">Progress</p>
                <p class="font-mono text-sm font-medium">
                  {{ (task?.percent ?? 0).toFixed(2) }}%
                </p>
              </div>
              <div>
                <p class="text-xs text-muted">Chunks</p>
                <p class="font-mono text-sm font-medium">
                  {{ (task?.processedChunks ?? 0).toLocaleString() }}
                  <span v-if="task?.totalChunks" class="text-muted">
                    / {{ task.totalChunks.toLocaleString() }}</span
                  >
                </p>
              </div>
              <div>
                <p class="text-xs text-muted">Rate</p>
                <p class="font-mono text-sm font-medium">
                  {{ task?.rate ? `${task.rate.toFixed(1)} cps` : "—" }}
                </p>
              </div>
              <div>
                <p class="text-xs text-muted">ETA</p>
                <p class="font-mono text-sm font-medium">
                  {{ formatEta(task?.etaSeconds) }}
                </p>
              </div>
            </div>

            <div class="flex gap-2 shrink-0">
              <UButton
                v-if="displayState === 'running'"
                icon="i-heroicons-pause-20-solid"
                color="warning"
                variant="soft"
                :loading="acting === 'pause'"
                :disabled="!server?.running"
                @click="runAction('pause')"
              >
                Pause
              </UButton>
              <UButton
                v-if="displayState === 'paused'"
                icon="i-heroicons-play-20-solid"
                color="success"
                :loading="acting === 'continue'"
                :disabled="!server?.running"
                @click="runAction('continue')"
              >
                Continue
              </UButton>
              <UButton
                icon="i-heroicons-x-mark-20-solid"
                color="error"
                variant="ghost"
                :loading="acting === 'cancel'"
                :disabled="!server?.running"
                @click="cancelOpen = true"
              >
                Cancel
              </UButton>
            </div>
          </div>

          <UProgress
            :model-value="task?.percent ?? 0"
            :max="100"
            :color="displayState === 'paused' ? 'warning' : 'primary'"
          />

          <p class="text-xs text-muted">
            Pre-generating radius
            {{ (task?.radius ?? 0).toLocaleString() }} blocks around
            {{ task?.centerX ?? 0 }}, {{ task?.centerZ ?? 0 }} — the world keeps
            running, but expect high CPU usage until it finishes. Progress is
            saved across server restarts.
          </p>
        </div>

        <!-- Completed / cancelled summary -->
        <UAlert
          v-if="displayState === 'completed'"
          icon="i-heroicons-check-circle"
          color="success"
          variant="soft"
          title="Pre-generation complete"
          :description="`${(task?.processedChunks ?? 0).toLocaleString()} chunks generated. Players can explore the area without any generation lag.`"
        />

        <!-- The Minecraft-style chunk colormap -->
        <ServerDetailChunkColormap
          class="max-w-lg mx-auto"
          :radius-blocks="vizRadius"
          :processed="task?.processedChunks ?? 0"
          :state="vizState"
          :center-x="task?.centerX ?? form.centerX"
          :center-z="task?.centerZ ?? form.centerZ"
          :current="vizCurrent"
        />
      </div>
    </UCard>

    <!-- Cancel confirmation -->
    <UModal
      v-model:open="cancelOpen"
      title="Cancel pre-generation"
      description="Chunky discards its task progress. Chunks that were already generated stay in the world."
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="acting === 'cancel'"
            @click="cancelOpen = false"
          >
            Keep running
          </UButton>
          <UButton
            color="error"
            :loading="acting === 'cancel'"
            @click="runAction('cancel')"
          >
            Cancel pre-generation
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from "~/utils/errors";

type PregenTask = {
  volume: string;
  state: string;
  radius: number;
  centerX: number;
  centerZ: number;
  processedChunks: number;
  totalChunks: number | null;
  percent: number;
  rate: number | null;
  etaSeconds: number | null;
  currentX: number | null;
  currentZ: number | null;
  startedAt: number | null;
  updatedAt: number;
  completedAt: number | null;
};

type PregenStatus = {
  supported: boolean;
  chunkyInstalled: boolean;
  running: boolean;
  live: boolean;
  task: PregenTask | null;
};

const { id, server, refresh: refreshServer } = useServerDetail();
const toast = useToast();

const { data: status, refresh } = useFetch<PregenStatus>(
  () => `/api/server/${id.value}/pregen/status`,
  { retry: false }
);

// Periodic fallback refresh (covers offline servers, other browser tabs, the
// background sampler advancing the task).
let interval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  interval = setInterval(refresh, 30_000);
});
onUnmounted(() => {
  if (interval) clearInterval(interval);
  closeStream();
});

// --- Task state ---------------------------------------------------------------

/** Live task pushed over SSE wins over the fetched snapshot. */
const liveTask = ref<PregenTask | null>(null);
const task = computed(() => liveTask.value ?? status.value?.task ?? null);
const displayState = computed(() => task.value?.state ?? "idle");
const hasActiveTask = computed(
  () => displayState.value === "running" || displayState.value === "paused"
);

/** Chunky enabled + container freshly running, but RCON/Chunky not answering yet. */
const installing = computed(
  () =>
    !!status.value?.chunkyInstalled &&
    !!server.value?.running &&
    !status.value?.live &&
    !task.value
);

const stateBadge = computed(() => {
  switch (displayState.value) {
    case "running":
      return { label: "Generating", color: "success" as const };
    case "paused":
      return { label: "Paused", color: "warning" as const };
    case "completed":
      return { label: "Completed", color: "primary" as const };
    case "cancelled":
      return { label: "Cancelled", color: "neutral" as const };
    case "failed":
      return { label: "Failed", color: "error" as const };
    default:
      return { label: "Not started", color: "neutral" as const };
  }
});

// --- Setup form ---------------------------------------------------------------

const form = reactive({ radius: 5000, centerX: 0, centerZ: 0 });

// Prefill from the last task so re-running is one click.
watch(
  task,
  (value) => {
    if (value && !hasActiveTask.value) {
      form.radius = value.radius || form.radius;
      form.centerX = value.centerX;
      form.centerZ = value.centerZ;
    }
  },
  { immediate: true }
);

function radiusToChunks(radiusBlocks: number) {
  const side = 2 * Math.ceil((radiusBlocks || 0) / 16) + 1;
  return side * side;
}

// --- Visualization bindings ----------------------------------------------------

/** While configuring, the canvas previews the chosen radius (all dark). */
const vizRadius = computed(() =>
  hasActiveTask.value || displayState.value === "completed"
    ? (task.value?.radius ?? form.radius)
    : form.radius
);
const vizState = computed(() => displayState.value);
const vizCurrent = computed(() =>
  task.value?.currentX != null && task.value?.currentZ != null
    ? { x: task.value.currentX, z: task.value.currentZ }
    : null
);

// --- Live progress stream (SSE) -------------------------------------------------

let source: EventSource | null = null;

function closeStream() {
  source?.close();
  source = null;
}

function openStream() {
  if (source || !import.meta.client) return;

  source = new EventSource(`/api/server/${id.value}/pregen/stream`);
  source.onmessage = (event) => {
    const frame = JSON.parse(event.data) as
      | { ok: true; task: PregenTask | null }
      | { ok: false; statusCode: number };

    if (frame.ok && frame.task) {
      liveTask.value = frame.task;
      if (frame.task.state === "completed") {
        toast.add({
          title: "Pre-generation complete",
          description: `${frame.task.processedChunks.toLocaleString()} chunks generated.`,
          color: "success",
        });
        closeStream();
        refresh();
      }
    }
    // Error frames (server restarting, Chunky loading) are ignored — the
    // stream stays open and recovers on its own.
  };
  source.onerror = () => {
    // Stream dropped (container recreated, server stopped) — fall back to the
    // 30s status poll; it reopens the stream when the task is running again.
    closeStream();
  };
}

// Stream only while a task is actually running — no point polling RCON
// every 2s for idle or paused tasks.
watch(
  () => displayState.value === "running" && !!server.value?.running,
  (shouldStream) => {
    if (shouldStream) openStream();
    else closeStream();
  },
  { immediate: true }
);

// --- Actions --------------------------------------------------------------------

const enabling = ref(false);
const starting = ref(false);
const acting = ref<"pause" | "continue" | "cancel" | null>(null);
const cancelOpen = ref(false);

async function enable() {
  enabling.value = true;
  try {
    const result = await $fetch<{ id: string }>(
      `/api/server/${id.value}/pregen/enable`,
      { method: "POST" }
    );
    toast.add({
      title: "Pre-generation enabled",
      description: "The server is restarting and downloading Chunky.",
      color: "success",
    });
    // Enabling recreates the container under a new id — navigate to it.
    await navigateTo(`/server/${result.id}/world`);
    await refreshNuxtData("servers");
  } catch (error) {
    toast.add({
      title: "Could not enable pre-generation",
      description: errorMessage(error, "Enabling pre-generation failed."),
      color: "error",
    });
  } finally {
    enabling.value = false;
  }
}

async function start() {
  starting.value = true;
  try {
    const { task: started } = await $fetch<{ task: PregenTask }>(
      `/api/server/${id.value}/pregen/start`,
      {
        method: "POST",
        body: {
          radius: form.radius,
          centerX: form.centerX,
          centerZ: form.centerZ,
        },
      }
    );
    liveTask.value = started;
    toast.add({
      title: "Pre-generation started",
      description: `Generating a ${form.radius.toLocaleString()} block radius around ${form.centerX}, ${form.centerZ}.`,
      color: "success",
    });
    await refresh();
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    toast.add({
      title: "Could not start pre-generation",
      description:
        statusCode === 409
          ? "The server is not running."
          : statusCode === 502
            ? "Chunky did not respond — it may still be installing. Try again in a minute."
            : errorMessage(error, "Starting pre-generation failed."),
      color: "error",
    });
  } finally {
    starting.value = false;
  }
}

async function runAction(action: "pause" | "continue" | "cancel") {
  acting.value = action;
  try {
    const { task: updated } = await $fetch<{ task: PregenTask | null }>(
      `/api/server/${id.value}/pregen/${action}`,
      { method: "POST" }
    );
    if (updated) liveTask.value = updated;
    if (action === "cancel") cancelOpen.value = false;
    toast.add({
      title:
        action === "pause"
          ? "Pre-generation paused"
          : action === "continue"
            ? "Pre-generation resumed"
            : "Pre-generation cancelled",
      color: "success",
    });
    await refresh();
  } catch (error) {
    toast.add({
      title: "Action failed",
      description: errorMessage(error, `Could not ${action} pre-generation.`),
      color: "error",
    });
  } finally {
    acting.value = null;
  }
}

// --- Formatting -------------------------------------------------------------------

function formatEta(seconds: number | null | undefined) {
  if (seconds == null || seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds)}s`;
}

// Reset live state when navigating to a different (recreated) container.
watch(id, () => {
  liveTask.value = null;
  closeStream();
});

// Refresh the parent's server data when our status says the container state
// changed (e.g. someone started the server from another tab).
watch(
  () => status.value?.running,
  (running) => {
    if (running !== undefined && running !== server.value?.running) {
      refreshServer();
    }
  }
);
</script>
