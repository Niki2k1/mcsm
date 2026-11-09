<template>
  <UContainer>
    <div>
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

                <div class="flex items-center gap-1 min-w-0">
                  <p class="font-mono text-sm text-muted truncate">
                    {{ server.domain }}
                  </p>
                  <UTooltip :text="copied ? 'Copied' : 'Copy address'">
                    <UButton
                      :icon="
                        copied
                          ? 'i-heroicons-check-20-solid'
                          : 'i-heroicons-clipboard-20-solid'
                      "
                      :color="copied ? 'success' : 'neutral'"
                      variant="ghost"
                      size="xs"
                      aria-label="Copy server address"
                      @click="copyAddress"
                    />
                  </UTooltip>
                </div>
              </div>
            </div>

            <div v-if="can('operator')" class="flex gap-2 shrink-0">
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

        <UPage>
          <template #left>
            <UPageAside>
              <UNavigationMenu
                :items="navGroups"
                orientation="vertical"
                highlight
              />
            </UPageAside>
          </template>

          <!-- The aside only shows from lg up; a horizontal tab bar can't fit eleven entries on a phone. -->
          <UDropdownMenu
            :items="navGroups"
            :content="{ align: 'start' }"
            :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width)' }"
            class="lg:hidden"
          >
            <UButton
              :icon="activeTab?.icon"
              :label="activeTab?.label"
              trailing-icon="i-heroicons-chevron-up-down-20-solid"
              color="neutral"
              variant="outline"
              block
              class="mt-6 justify-start"
              :ui="{ trailingIcon: 'ms-auto' }"
            />
          </UDropdownMenu>

          <UPageBody>
            <NuxtPage />
          </UPageBody>
        </UPage>
      </template>
    </div>
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
  key: `server-${id.value}`,
  retry: false,
});

// Links from before servers were addressed by container name carry a
// container id; swap it for the name so the URL survives the next recreate.
watchEffect(() => {
  if (!server.value || server.value.id === id.value) return;
  const prefix = `/server/${id.value}`;
  if (!route.path.startsWith(prefix)) return;
  navigateTo(
    {
      path: `/server/${server.value.id}${route.path.slice(prefix.length)}`,
      query: route.query,
    },
    { replace: true }
  );
});

useSeoMeta({
  title: () => (server.value ? `${server.value.name} · MCSM` : "Server · MCSM"),
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

const can = (need: ServerAccessLevel) =>
  hasServerAccess(server.value?.access, need);

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
  can,
});

// --- Header ------------------------------------------------------------------

/** Live MOTD as the running server reports it via ping. */
const motd = computed(() => chatToMotd(ping.value?.status?.description));
/** Header icon: a just-uploaded icon shows immediately, before any restart. */
const favicon = displayFavicon;

const copied = ref(false);

async function copyAddress() {
  if (!server.value) return;
  await navigator.clipboard.writeText(server.value.domain);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

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

// --- Navigation -------------------------------------------------------------

interface NavTab {
  label: string;
  role: ServerAccessLevel;
  icon: string;
  to: string;
  exact?: boolean;
}

const navSections = computed<{ label?: string; items: NavTab[] }[]>(() => [
  {
    items: [
      {
        label: "Overview",
        role: "viewer",
        icon: "i-heroicons-home-20-solid",
        to: `/server/${id.value}`,
        exact: true,
      },
      {
        label: "Console",
        role: "operator",
        icon: "i-heroicons-command-line-20-solid",
        to: `/server/${id.value}/console`,
      },
      {
        label: "Players",
        role: "viewer",
        icon: "i-heroicons-users-20-solid",
        to: `/server/${id.value}/players`,
      },
      {
        label: "Audit Log",
        role: "viewer",
        icon: "i-heroicons-clipboard-document-list-20-solid",
        to: `/server/${id.value}/audit-log`,
      },
      {
        label: "Analytics",
        role: "viewer",
        icon: "i-heroicons-chart-bar-20-solid",
        to: `/server/${id.value}/analytics`,
      },
    ],
  },
  {
    label: "World",
    items: [
      {
        label: "Map",
        role: "viewer",
        icon: "i-heroicons-map-20-solid",
        to: `/server/${id.value}/map`,
      },
      {
        label: "Pre-Generation",
        role: "manager",
        icon: "i-heroicons-globe-alt-20-solid",
        to: `/server/${id.value}/world`,
      },
      {
        label: "Backups",
        role: "manager",
        icon: "i-heroicons-archive-box-20-solid",
        to: `/server/${id.value}/backups`,
      },
    ],
  },
  {
    label: "Server",
    items: [
      {
        label: "Configuration",
        role: "manager",
        icon: "i-heroicons-adjustments-horizontal-20-solid",
        to: `/server/${id.value}/configuration`,
      },
      {
        label: "Mods & Plugins",
        role: "manager",
        icon: "i-heroicons-puzzle-piece-20-solid",
        to: `/server/${id.value}/mods`,
      },
      {
        label: "Files",
        role: "manager",
        icon: "i-heroicons-folder-20-solid",
        to: `/server/${id.value}/files`,
      },
      {
        label: "Environment",
        role: "manager",
        icon: "i-heroicons-variable-20-solid",
        to: `/server/${id.value}/environment`,
      },
      {
        label: "Settings",
        role: "manager",
        icon: "i-heroicons-cog-6-tooth-20-solid",
        to: `/server/${id.value}/settings`,
      },
    ],
  },
]);

const allTabs = computed(() =>
  navSections.value.flatMap((section) => section.items)
);

const visibleSections = computed(() =>
  navSections.value
    .map((section) => ({
      label: section.label,
      items: section.items
        .filter((tab) => can(tab.role))
        .map(({ role: _, ...tab }) => tab),
    }))
    .filter((section) => section.items.length)
);

const navGroups = computed(() =>
  visibleSections.value.map((section) =>
    section.label
      ? [{ label: section.label, type: "label" as const }, ...section.items]
      : section.items
  )
);

const activeTab = computed(() =>
  allTabs.value.find((tab) =>
    tab.exact ? route.path === tab.to : route.path.startsWith(tab.to)
  )
);

// Deep links into a tab the user can't use would only show failing requests.
watchEffect(() => {
  if (!server.value) return;
  const tab = allTabs.value.find(
    (entry) => !entry.exact && route.path.startsWith(entry.to)
  );
  if (tab && !can(tab.role))
    navigateTo(`/server/${id.value}`, { replace: true });
});

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
  } catch (error) {
    toast.add({
      title: "Error",
      description: errorMessage(error, `Failed to ${action} server.`),
      color: "error",
    });
    // A server deleted meanwhile: reloading switches to the "doesn't exist" view.
    if ((error as { statusCode?: number }).statusCode === 404) await refresh();
  } finally {
    acting.value = null;
  }
}
</script>
