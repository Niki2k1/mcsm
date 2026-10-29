<template>
  <div v-if="server" class="space-y-6">
    <!-- Live status -->
    <UCard>
      <template #header>
        <h3 class="font-semibold">Status</h3>
      </template>

      <div class="space-y-4">
        <!-- The server exactly as players see it in their multiplayer screen -->
        <ServerListPreview
          :name="server.name"
          :motd="motd"
          :favicon="displayFavicon"
          :players="ping?.status?.players"
          :latency="ping?.latency"
        />

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p class="text-xs text-muted mb-1">State</p>
            <UBadge :color="stateColor" variant="soft">{{ stateText }}</UBadge>
          </div>
          <div>
            <p class="text-xs text-muted mb-1">Players</p>
            <p class="text-sm font-medium">
              <template v-if="ping?.status?.players">
                {{ ping.status.players.online }}/{{ ping.status.players.max }}
              </template>
              <template v-else>—</template>
            </p>
          </div>
          <div>
            <p class="text-xs text-muted mb-1">Latency</p>
            <p class="text-sm font-medium">
              <template v-if="ping?.latency != null"
                >{{ ping.latency }}ms</template
              >
              <template v-else>—</template>
            </p>
          </div>
          <div>
            <p class="text-xs text-muted mb-1">Uptime</p>
            <p class="text-sm font-medium">{{ uptime }}</p>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Voice chat (the game address lives in the page header) -->
    <UCard v-if="voicePort">
      <template #header>
        <h3 class="font-semibold">Voice chat</h3>
      </template>

      <CopyField :value="`${server.domain}:${voicePort}`" />
      <p class="text-xs text-muted mt-2">
        Clients with Simple Voice Chat connect to this UDP port on their own
        once they join. The port must be open in the host's firewall.
      </p>
    </UCard>

    <!-- Configuration summary -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">About</h3>
          <UButton
            v-if="can('manager')"
            :to="`/server/${id}/configuration`"
            variant="ghost"
            color="neutral"
            size="xs"
            trailing-icon="i-heroicons-arrow-right-20-solid"
          >
            Configure
          </UButton>
        </div>
      </template>

      <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
        <div v-for="item in about" :key="item.label">
          <dt class="text-xs text-muted mb-1">{{ item.label }}</dt>
          <dd class="text-sm font-medium">{{ item.value }}</dd>
        </div>
      </dl>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { activeVoicePort } from "#shared/utils/voiceChat";
import { chatToMotd } from "~/utils/motd";
import { durationSince } from "~/utils/time";

const { id, server, ping, pingStatus, displayFavicon, can } = useServerDetail();

const motd = computed(() => chatToMotd(ping.value?.status?.description));

const stateColor = computed(() => {
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

const stateText = computed(() => {
  if (!server.value?.running) return "Stopped";
  switch (pingStatus.value) {
    case "success":
      return "Online";
    case "error":
      return "Starting / unreachable";
    case "pending":
      return "Loading...";
    default:
      return "Unknown";
  }
});

// Re-rendered every 30s so the uptime stays fresh without a page reload.
const now = useTimestamp({ scheduler: (cb) => useIntervalFn(cb, 30_000) });

const uptime = computed(() => {
  // `now` is referenced so the computed re-evaluates as time passes.
  void now.value;
  if (!server.value?.running || !server.value.startedAt) return "—";
  return durationSince(server.value.startedAt);
});

const about = computed(() => {
  const config = server.value?.config;
  return [
    { label: "Type", value: config?.type ?? "Unknown" },
    {
      label: "Version",
      value:
        ping.value?.status?.version?.name ?? config?.VERSION?.label ?? "Latest",
    },
    { label: "Memory", value: config?.memory ?? "—" },
    { label: "World", value: config?.LEVEL ?? "world" },
    { label: "Difficulty", value: config?.DIFFICULTY ?? "—" },
    {
      label: "Max players",
      value: config?.MAX_PLAYERS != null ? String(config.MAX_PLAYERS) : "—",
    },
    {
      label: "Online mode",
      value: config?.ONLINE_MODE ? "Enabled" : "Disabled",
    },
    { label: "Hardcore", value: config?.HARDCORE ? "Yes" : "No" },
  ];
});

const voicePort = computed(() => activeVoicePort(server.value?.config));
</script>
