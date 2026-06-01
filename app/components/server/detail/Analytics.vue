<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <UTabs
          v-model="range"
          :items="rangeOptions"
          :content="false"
          size="sm"
        />
        <UButton
          icon="i-heroicons-arrow-path-20-solid"
          variant="ghost"
          color="neutral"
          size="xs"
          aria-label="Refresh analytics"
          :loading="status === 'pending'"
          @click="refresh()"
        />
      </div>
      <p class="text-xs text-muted">
        Sampled every minute while the server is running.
      </p>
    </div>

    <!-- Empty state -->
    <div
      v-if="!samples.length"
      class="py-16 text-center text-muted space-y-3"
    >
      <UIcon
        name="i-heroicons-chart-bar"
        class="size-8 mx-auto opacity-60"
      />
      <p>No data for this time range yet.</p>
      <p class="text-xs">
        Metrics are collected once a minute while the server runs — check back
        in a few minutes.
      </p>
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-2">
      <!-- Players -->
      <UCard>
        <template #header>
          <h3 class="font-semibold">Players online</h3>
        </template>
        <AreaChart
          :data="playersData"
          :categories="playersCategories"
          :height="220"
          :curve-type="CurveType.MonotoneX"
          :x-formatter="xFormatter"
          :y-grid-line="true"
          :hide-legend="true"
        />
      </UCard>

      <!-- CPU -->
      <UCard>
        <template #header>
          <h3 class="font-semibold">CPU usage</h3>
        </template>
        <AreaChart
          :data="cpuData"
          :categories="cpuCategories"
          :height="220"
          :curve-type="CurveType.MonotoneX"
          :x-formatter="xFormatter"
          :y-formatter="(value: number) => `${value}%`"
          :y-grid-line="true"
          :hide-legend="true"
        />
      </UCard>

      <!-- Memory -->
      <UCard>
        <template #header>
          <div class="flex items-baseline justify-between">
            <h3 class="font-semibold">Memory</h3>
            <span v-if="memLimitLabel" class="text-xs text-muted"
              >limit {{ memLimitLabel }}</span
            >
          </div>
        </template>
        <AreaChart
          :data="memData"
          :categories="memCategories"
          :height="220"
          :curve-type="CurveType.MonotoneX"
          :x-formatter="xFormatter"
          :y-formatter="(value: number) => `${value} MiB`"
          :y-grid-line="true"
          :hide-legend="true"
        />
      </UCard>

      <!-- Latency -->
      <UCard>
        <template #header>
          <h3 class="font-semibold">Latency</h3>
        </template>
        <AreaChart
          :data="latencyData"
          :categories="latencyCategories"
          :height="220"
          :curve-type="CurveType.MonotoneX"
          :x-formatter="xFormatter"
          :y-formatter="(value: number) => `${value} ms`"
          :y-grid-line="true"
          :hide-legend="true"
        />
      </UCard>

      <!-- Network I/O -->
      <UCard class="lg:col-span-2">
        <template #header>
          <h3 class="font-semibold">Network I/O</h3>
        </template>
        <AreaChart
          :data="networkData"
          :categories="networkCategories"
          :height="220"
          :curve-type="CurveType.MonotoneX"
          :x-formatter="networkXFormatter"
          :y-formatter="(value: number) => `${value} KiB/min`"
          :y-grid-line="true"
        />
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const { id } = useServerDetail();

// --- Data ---------------------------------------------------------------------

type Sample = {
  t: number;
  cpu: number | null;
  memUsed: number | null;
  memLimit: number | null;
  netRx: number | null;
  netTx: number | null;
  players: number | null;
  maxPlayers: number | null;
  latency: number | null;
};

const range = ref<"1h" | "24h" | "7d">("24h");

const rangeOptions = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
];

const { data, refresh, status } = useFetch<{ samples: Sample[] }>(
  () => `/api/server/${id.value}/stats/history`,
  { query: { range }, retry: false }
);

// Refresh once a minute so charts roll forward while the tab is open.
let interval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  interval = setInterval(refresh, 60_000);
});
onUnmounted(() => {
  if (interval) clearInterval(interval);
});

const samples = computed(() => data.value?.samples ?? []);

// --- Axis formatting ------------------------------------------------------------

function formatTick(timestamp: number | undefined) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (range.value === "7d") {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const xFormatter = (i: number) => formatTick(samples.value[i]?.t);

// --- Chart data -------------------------------------------------------------------

const playersData = computed(() =>
  samples.value.map((sample) => ({
    t: sample.t,
    players: sample.players ?? 0,
  }))
);
const playersCategories = {
  players: { name: "Players", color: "var(--ui-primary)" },
};

const cpuData = computed(() =>
  samples.value.map((sample) => ({
    t: sample.t,
    cpu: Math.round((sample.cpu ?? 0) * 10) / 10,
  }))
);
const cpuCategories = { cpu: { name: "CPU", color: "#f97316" } };

const MIB = 1024 * 1024;

const memData = computed(() =>
  samples.value.map((sample) => ({
    t: sample.t,
    used: Math.round((sample.memUsed ?? 0) / MIB),
  }))
);
const memCategories = { used: { name: "Used", color: "#8b5cf6" } };

const memLimitLabel = computed(() => {
  const limit = samples.value.findLast?.(
    (sample) => sample.memLimit
  )?.memLimit;
  if (!limit) return "";
  return `${Math.round((limit / MIB / 1024) * 10) / 10} GiB`;
});

const latencyData = computed(() =>
  samples.value.map((sample) => ({
    t: sample.t,
    latency: sample.latency ?? 0,
  }))
);
const latencyCategories = {
  latency: { name: "Latency", color: "#06b6d4" },
};

// Network counters are cumulative — chart per-minute deltas instead. Counter
// resets (container restarts) show up as gaps rather than negative spikes.
const networkData = computed(() => {
  const points: { t: number; rx: number; tx: number }[] = [];
  for (let i = 1; i < samples.value.length; i++) {
    const prev = samples.value[i - 1]!;
    const current = samples.value[i]!;
    const rx = (current.netRx ?? 0) - (prev.netRx ?? 0);
    const tx = (current.netTx ?? 0) - (prev.netTx ?? 0);
    points.push({
      t: current.t,
      rx: rx >= 0 ? Math.round(rx / 1024) : 0,
      tx: tx >= 0 ? Math.round(tx / 1024) : 0,
    });
  }
  return points;
});
const networkCategories = {
  rx: { name: "Received", color: "#22c55e" },
  tx: { name: "Sent", color: "#3b82f6" },
};
const networkXFormatter = (i: number) => formatTick(networkData.value[i]?.t);
</script>
