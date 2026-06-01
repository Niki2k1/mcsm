<template>
  <NuxtLink
    :to="`/server/${server.id}`"
    class="block rounded-lg shadow-md overflow-hidden text-highlighted relative ring-1 ring-default transition hover:shadow-lg hover:ring-primary"
    :class="borderClass"
  >
    <div
      class="absolute inset-y-0 left-0 w-36 bg-gradient-to-r to-transparent"
      :class="gradientColor"
    ></div>
    <div class="grow p-4 relative z-10">
      <div class="flex justify-between items-start mb-2 gap-2">
        <div class="flex items-center gap-3 min-w-0">
          <!-- Server icon: live ping first, then the configured icon URL -->
          <img
            v-if="cardIcon"
            :src="cardIcon"
            alt=""
            class="size-10 shrink-0 rounded [image-rendering:pixelated] ring-1 ring-default"
          />
          <div class="min-w-0">
            <h2 class="text-lg font-semibold truncate">{{ server.name }}</h2>
            <p class="text-xs text-muted font-mono truncate">
              {{ server.domain }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <UBadge :color="statusColor" variant="soft">
            <UIcon
              v-if="status === 'pending'"
              name="i-heroicons-arrow-path-20-solid"
              class="animate-spin"
            />
            {{ statusText }}
          </UBadge>

          <!-- BlueMap web map (opens in a new tab). -->
          <UButton
            v-if="mapUrl"
            :href="mapUrl"
            target="_blank"
            external
            icon="i-heroicons-map-20-solid"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Open BlueMap"
            @click.stop
          />

          <!-- Quick start/stop. Everything else lives on the detail page. -->
          <UButton
            v-if="server.running"
            icon="i-heroicons-stop-20-solid"
            color="warning"
            variant="ghost"
            size="xs"
            aria-label="Stop server"
            @click.stop.prevent="emit('stop', server)"
          />
          <UButton
            v-else
            icon="i-heroicons-play-20-solid"
            color="success"
            variant="ghost"
            size="xs"
            aria-label="Start server"
            @click.stop.prevent="emit('start', server)"
          />
        </div>
      </div>

      <MotdPreview :motd="motd" class="mb-2 min-h-[1.2em]" />

      <div class="flex justify-between text-sm" v-if="status === 'success'">
        <span class="flex gap-2 items-center">
          <UIcon name="i-heroicons-users-20-solid" />
          {{ info?.status?.players?.online }}/{{ info?.status?.players?.max }}
        </span>
        <span class="flex gap-2 items-center">
          <UIcon name="i-tabler-wave-saw-tool" />
          {{ info?.latency }}ms
        </span>
      </div>
    </div>
  </NuxtLink>
</template>

<script lang="ts" setup>
import { chatToMotd } from "~/utils/motd";
import MotdPreview from "~/components/server/motd/MotdPreview.vue";
import type { ServerPing } from "~/composables/server-detail";

const props = defineProps<{
  server: {
    id: string;
    name: string;
    domain: string;
    type: string | null;
    running: boolean;
    config?: { ICON?: string | null; BLUEMAP?: boolean } | null;
    volume?: string | null;
  };
}>();

// BlueMap link — served through MCSM's /map/ proxy, keyed by volume name.
// A plain href (not NuxtLink): /map/ is a server route, not an SPA page.
const mapUrl = computed(() =>
  props.server.config?.BLUEMAP && props.server.running && props.server.volume
    ? `/map/${props.server.volume}/`
    : null
);

const emit = defineEmits<{
  start: [server: { id: string; name: string }];
  stop: [server: { id: string; name: string }];
}>();

const {
  data: info,
  refresh,
  status: _status,
} = useFetch<ServerPing>("/api/minecraft/server/info", {
  query: { host: props.server.domain },
  retry: false,
});

// The ping description may be a legacy string or a chat component (modern
// servers send truecolour MOTDs this way); flatten either into codes we render.
const motd = computed(() => chatToMotd(info.value?.status?.description));

// Live favicon from the ping, falling back to the configured icon URL.
const cardIcon = computed(
  () => info.value?.status?.favicon || props.server.config?.ICON || undefined
);

const status = ref<"success" | "error" | "pending" | "idle">("idle");

watchDebounced(
  _status,
  (newVal) => {
    status.value = newVal;
  },
  { debounce: 800, immediate: true }
);

const interval = ref<NodeJS.Timeout | null>(null);

onMounted(() => {
  interval.value = setInterval(refresh, 60000);
});

onUnmounted(() => {
  if (interval.value) clearInterval(interval.value);
});

const statusColor = computed(() => {
  switch (status.value) {
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

const gradientColor = computed(() => {
  switch (status.value) {
    case "success":
      return "from-green-500/15";
    case "error":
      return "from-red-500/15";
    case "pending":
      return "from-yellow-500/15";
    default:
      return "from-gray-500/15";
  }
});

const borderClass = computed(() => {
  switch (status.value) {
    case "success":
      return "border-l-4 border-green-500";
    case "error":
      return "border-l-4 border-red-500";
    case "pending":
      return "border-l-4 border-yellow-500";
    default:
      return "border-l-4 border-gray-500";
  }
});

const statusText = computed(() => {
  switch (status.value) {
    case "success":
      return "Online";
    case "error":
      return "Offline";
    case "pending":
      return "Loading...";
    default:
      return "Unknown";
  }
});
</script>
