<template>
  <div
    class="rounded-lg shadow-md overflow-hidden flex text-highlighted relative ring-1 ring-default"
    :class="borderClass"
  >
    <div
      class="absolute inset-y-0 left-0 w-36 bg-gradient-to-r to-transparent"
      :class="gradientColor"
    ></div>
    <div class="grow p-4 relative z-10">
      <div class="flex justify-between items-start mb-2 gap-2">
        <div class="min-w-0">
          <h2 class="text-lg font-semibold truncate">{{ server.name }}</h2>
          <p class="text-xs text-muted font-mono truncate">
            {{ server.domain }}
          </p>
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

          <UButton
            icon="i-heroicons-pencil-square-20-solid"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Edit server"
            @click="emit('edit', server.id)"
          />
          <UButton
            icon="i-heroicons-trash-20-solid"
            color="error"
            variant="ghost"
            size="xs"
            aria-label="Delete server"
            @click="emit('delete', server)"
          />
        </div>
      </div>

      <Motd :motd="info?.status.description.text ?? ''" />

      <div class="flex justify-between text-sm" v-if="status === 'success'">
        <span class="flex gap-2 items-center">
          <UIcon name="i-heroicons-users-20-solid" />
          {{ info?.status.players.online }}/{{ info?.status.players.max }}
        </span>
        <span class="flex gap-2 items-center">
          <UIcon name="i-tabler-wave-saw-tool" />
          {{ info?.latency }}ms
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
const props = defineProps<{
  server: {
    id: string;
    name: string;
    domain: string;
    type: string | null;
    running: boolean;
  };
}>();

const emit = defineEmits<{
  edit: [id: string];
  delete: [server: { id: string; name: string }];
}>();

const {
  data: info,
  refresh,
  status: _status,
} = useFetch("/api/minecraft/server/info", {
  query: { host: props.server.domain },
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
