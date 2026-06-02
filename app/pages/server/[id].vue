<template>
  <UContainer>
    <UPage>
      <!-- Not found -->
      <div v-if="error" class="py-24 text-center text-muted space-y-4">
        <UIcon
          name="i-heroicons-question-mark-circle"
          class="size-10 mx-auto opacity-60"
        />
        <p>This server doesn't exist (anymore).</p>
        <UButton to="/" icon="i-heroicons-arrow-left-20-solid" variant="soft">
          Back to overview
        </UButton>
      </div>

      <template v-else-if="server">
        <!-- Header: breadcrumb, icon + name/MOTD/domain, actions -->
        <div class="pt-8 space-y-4">
          <UBreadcrumb :items="breadcrumb" />

          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-4 min-w-0">
              <!-- Server icon, exactly as the server reports it -->
              <img
                v-if="favicon"
                :src="favicon"
                alt="Server icon"
                class="size-16 shrink-0 rounded-lg ring-1 ring-default [image-rendering:pixelated]"
              />

              <div class="min-w-0 space-y-1">
                <h1
                  class="flex flex-wrap items-center gap-3 text-2xl sm:text-3xl font-bold text-highlighted"
                >
                  <span class="truncate">{{ server.name }}</span>
                  <UBadge :color="statusColor" variant="soft" size="lg">
                    <UIcon
                      v-if="pingStatus === 'pending'"
                      name="i-heroicons-arrow-path-20-solid"
                      class="animate-spin"
                    />
                    {{ statusText }}
                  </UBadge>
                </h1>

                <!-- Live MOTD as the server reports it -->
                <MotdPreview v-if="motd" :motd="motd" />

                <p class="font-mono text-sm text-muted truncate">
                  {{ server.domain }}
                </p>
              </div>
            </div>

            <div class="flex gap-2 shrink-0">
              <UButton
                v-if="server.running"
                icon="i-heroicons-arrow-path-20-solid"
                color="neutral"
                variant="outline"
                :loading="acting === 'restart'"
                @click="runAction('restart')"
              >
                Restart
              </UButton>
              <UButton
                v-if="server.running"
                icon="i-heroicons-stop-20-solid"
                color="warning"
                variant="soft"
                :loading="acting === 'stop'"
                @click="runAction('stop')"
              >
                Stop
              </UButton>
              <UButton
                v-else
                icon="i-heroicons-play-20-solid"
                color="success"
                :loading="acting === 'start'"
                @click="runAction('start')"
              >
                Start
              </UButton>
            </div>
          </div>
        </div>

        <!-- Tab bar (Vercel/GitHub style) -->
        <UNavigationMenu
          :items="tabs"
          highlight
          class="border-b border-default -mx-4 px-4 sm:-mx-6 sm:px-6 mt-6"
        />

        <UPageBody>
          <NuxtPage />
        </UPageBody>
      </template>
    </UPage>
  </UContainer>
</template>

<script setup lang="ts">
import type { ServerDetail, ServerPing } from "~/composables/server-detail";
import { chatToMotd } from "~/utils/motd";
import MotdPreview from "~/components/server/motd/MotdPreview.vue";

const route = useRoute();
const toast = useToast();

const id = computed(() => route.params.id as string);

const {
  data: server,
  refresh,
  pending,
  error,
} = await useFetch<ServerDetail>(() => `/api/server/${id.value}`, {
  // Key by container id so navigating to the recreated container after a
  // config save fetches fresh data instead of reusing the old payload.
  key: `server-${id.value}`,
  retry: false,
});

useSeoMeta({
  title: () =>
    server.value
      ? `${server.value.name} · Minecraft Server Manager`
      : "Server · Minecraft Server Manager",
});

// --- Live Minecraft ping (status badge + reused by the Overview tab) --------

const {
  data: ping,
  refresh: refreshPing,
  status: rawPingStatus,
} = useFetch<ServerPing>("/api/minecraft/server/info", {
  query: computed(() => ({ host: server.value?.domain })),
  immediate: false,
  retry: false,
});

// Avoid badge flicker on quick refreshes (same approach as the server card).
const pingStatus = ref<"success" | "error" | "pending" | "idle">("idle");
watchDebounced(rawPingStatus, (value) => (pingStatus.value = value), {
  debounce: 800,
  immediate: true,
});

let pingInterval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  if (server.value) refreshPing();
  pingInterval = setInterval(() => {
    if (server.value?.running) refreshPing();
  }, 30_000);
});
onUnmounted(() => {
  if (pingInterval) clearInterval(pingInterval);
});

// --- Shared context for the tab pages ---------------------------------------

// Icon to display: the running server's live favicon wins; the ICON URL from
// the saved config covers stopped servers and not-yet-applied changes.
const displayFavicon = computed(
  () => ping.value?.status?.favicon || server.value?.config?.ICON || undefined
);

provideServerDetail({
  id,
  server,
  refresh: async () => {
    await refresh();
    await refreshPing();
  },
  pending,
  ping,
  pingStatus,
  refreshPing: async () => {
    await refreshPing();
  },
  displayFavicon,
});

// --- Header ------------------------------------------------------------------

/** Live MOTD as the running server reports it via ping. */
const motd = computed(() => chatToMotd(ping.value?.status?.description));
/** Header icon: a just-uploaded icon shows immediately, before any restart. */
const favicon = displayFavicon;

const breadcrumb = computed(() => [
  { label: "Servers", to: "/", icon: "i-heroicons-squares-2x2-16-solid" },
  { label: server.value?.name ?? "Server" },
]);

const statusColor = computed(() => {
  if (!server.value?.running) return "neutral";
  switch (pingStatus.value) {
    case "success":
      return "success";
    case "error":
      return "error";
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
});

const statusText = computed(() => {
  if (!server.value?.running) return "Stopped";
  switch (pingStatus.value) {
    case "success":
      return "Online";
    case "error":
      return "Starting";
    case "pending":
      return "Loading...";
    default:
      return "Unknown";
  }
});

// --- Tabs --------------------------------------------------------------------

const tabs = computed(() => [
  {
    label: "Overview",
    icon: "i-heroicons-home-20-solid",
    to: `/server/${id.value}`,
    exact: true,
  },
  {
    label: "Configuration",
    icon: "i-heroicons-adjustments-horizontal-20-solid",
    to: `/server/${id.value}/configuration`,
  },
  {
    label: "Environment",
    icon: "i-heroicons-variable-20-solid",
    to: `/server/${id.value}/environment`,
  },
  {
    label: "Players",
    icon: "i-heroicons-users-20-solid",
    to: `/server/${id.value}/players`,
  },
  {
    label: "Console",
    icon: "i-heroicons-command-line-20-solid",
    to: `/server/${id.value}/console`,
  },
  {
    label: "Analytics",
    icon: "i-heroicons-chart-bar-20-solid",
    to: `/server/${id.value}/analytics`,
  },
  {
    label: "Backups",
    icon: "i-heroicons-archive-box-20-solid",
    to: `/server/${id.value}/backups`,
  },
  {
    label: "World",
    icon: "i-heroicons-globe-alt-20-solid",
    to: `/server/${id.value}/world`,
  },
  {
    label: "Map",
    icon: "i-heroicons-map-20-solid",
    to: `/server/${id.value}/map`,
  },
  {
    // Paper loads plugins; the mod loaders load mods. Unsupported types still
    // get the tab (it explains why the feature isn't available).
    label:
      server.value?.config?.type === "PAPER"
        ? "Plugins"
        : ["FABRIC", "FORGE", "AUTO_CURSEFORGE"].includes(
              server.value?.config?.type ?? ""
            )
          ? "Mods"
          : "Files",
    icon: "i-heroicons-puzzle-piece-20-solid",
    to: `/server/${id.value}/files`,
  },
  {
    label: "Settings",
    icon: "i-heroicons-cog-6-tooth-20-solid",
    to: `/server/${id.value}/settings`,
  },
]);

// --- Actions ------------------------------------------------------------------

const acting = ref<"start" | "stop" | "restart" | null>(null);

async function runAction(action: "start" | "stop" | "restart") {
  acting.value = action;
  try {
    await $fetch(`/api/server/${id.value}/${action}`, { method: "POST" });
    toast.add({
      title:
        action === "start"
          ? "Server starting"
          : action === "stop"
            ? "Server stopping"
            : "Server restarting",
      color: "success",
    });
    await refresh();
    await refreshNuxtData("servers");
  } catch {
    toast.add({
      title: "Error",
      description: `Failed to ${action} server.`,
      color: "error",
    });
  } finally {
    acting.value = null;
  }
}
</script>
