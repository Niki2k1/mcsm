<template>
  <div
    class="rounded-lg shadow-md overflow-hidden flex dark:text-white relative ring-1 ring-gray-200 dark:ring-gray-800"
    :class="borderClass"
  >
    <div
      class="absolute inset-y-0 left-0 w-36 bg-gradient-to-r to-transparent"
      :class="gradientColor"
    ></div>
    <div class="flex-grow p-4 relative z-10">
      <div class="flex justify-between items-center mb-2">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          {{ host }}
        </h2>
        <UBadge :color="statusColor" variant="soft">
          <div class="flex items-center gap-1">
            <UIcon
              v-if="status === 'pending'"
              name="i-heroicons-arrow-path-20-solid"
              class="animate-spin"
            />
            {{ statusText }}
          </div>
        </UBadge>
      </div>
      <Motd :motd="server?.status.description.text ?? ''" />
      <div class="flex justify-between text-sm" v-if="status === 'success'">
        <span class="flex gap-2 items-center">
          <UIcon name="i-heroicons-users-20-solid" />
          {{ server?.status.players.online }}/{{ server?.status.players.max }}
        </span>
        <span class="flex gap-2 items-center">
          <UIcon name="i-tabler-wave-saw-tool" />
          {{ server?.latency }}ms
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
const props = defineProps<{
  host: string;
}>();

const {
  data: server,
  refresh,
  status: _status,
} = useFetch("/api/minecraft/server/info", {
  query: props,
  retry: false,
});

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
  if (interval.value) {
    clearInterval(interval.value);
  }
});

const statusColor = computed(() => {
  switch (status.value) {
    case "success":
      return "green";
    case "error":
      return "red";
    case "pending":
      return "yellow";
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
