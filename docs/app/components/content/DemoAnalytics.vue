<template>
  <div class="not-prose space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <UTabs v-model="range" :items="rangeOptions" :content="false" size="sm" />
        <UButton
          icon="i-lucide-refresh-cw"
          variant="ghost"
          color="neutral"
          size="xs"
          aria-label="Regenerate demo data"
          @click="generate"
        />
      </div>
      <p class="text-xs text-muted">
        Sampled every minute while the server is running.
        <UBadge variant="subtle" size="sm" class="ml-1">demo data</UBadge>
      </p>
    </div>

    <div v-if="samples.length" class="grid gap-4 lg:grid-cols-2">
      <!-- Players -->
      <UCard>
        <template #header>
          <h3 class="font-semibold">Players online</h3>
        </template>
        <AreaChart
          :data="playersData"
          :categories="playersCategories"
          :height="180"
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
          :height="180"
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
            <span class="text-xs text-muted">limit 4 GiB</span>
          </div>
        </template>
        <AreaChart
          :data="memData"
          :categories="memCategories"
          :height="180"
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
          :height="180"
          :curve-type="CurveType.MonotoneX"
          :x-formatter="xFormatter"
          :y-formatter="(value: number) => `${value} ms`"
          :y-grid-line="true"
          :hide-legend="true"
        />
      </UCard>
    </div>

    <!-- SSR / initial skeleton -->
    <div v-else class="grid gap-4 lg:grid-cols-2">
      <USkeleton v-for="i in 4" :key="i" class="h-[260px] w-full" />
    </div>
  </div>
</template>

<script setup lang="ts">
// Interactive recreation of MCSM's Analytics tab with generated demo data —
// the real thing charts per-minute samples from the Docker stats API and
// Minecraft pings, stored in MCSM's SQLite database.

type Sample = {
  t: number;
  players: number;
  cpu: number;
  mem: number;
  latency: number;
};

const range = ref<"1h" | "24h" | "7d">("24h");

const rangeOptions = [
  { label: "1h", value: "1h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
];

const samples = ref<Sample[]>([]);

// --- Demo data generation (client-only, so SSR and hydration agree) -----------

function generate() {
  const config = {
    "1h": { points: 60, step: 60_000 },
    "24h": { points: 144, step: 10 * 60_000 },
    "7d": { points: 168, step: 60 * 60_000 },
  }[range.value];

  const now = Date.now();
  const result: Sample[] = [];
  let mem = 1100 + Math.random() * 200;

  for (let i = 0; i < config.points; i++) {
    const t = now - (config.points - 1 - i) * config.step;
    const date = new Date(t);
    const hour = date.getHours() + date.getMinutes() / 60;

    // Players follow a day/night cycle peaking around 20:00.
    const dayCycle = Math.max(0, Math.cos(((hour - 20) / 24) * 2 * Math.PI));
    const players = Math.max(
      0,
      Math.round(dayCycle * 14 + Math.sin(i * 0.7) * 1.5 + Math.random() * 2)
    );

    // CPU correlates with players, plus background work and the odd spike.
    const spike = Math.random() < 0.04 ? 25 + Math.random() * 30 : 0;
    const cpu =
      Math.round((4 + players * 1.8 + Math.random() * 3 + spike) * 10) / 10;

    // Memory: slow JVM growth with GC sawtooth drops.
    mem += players * 0.4 + Math.random() * 8 - 2;
    if (mem > 2600) mem = 1400 + Math.random() * 150; // GC / restart
    const memRounded = Math.round(mem);

    // Latency: stable LAN-ish with occasional hiccups.
    const latency =
      Math.round((1.2 + Math.random() * 0.8 + (Math.random() < 0.03 ? 4 + Math.random() * 6 : 0)) * 10) / 10;

    result.push({ t, players, cpu, mem: memRounded, latency });
  }

  samples.value = result;
}

onMounted(generate);
watch(range, generate);

// --- Axis formatting ----------------------------------------------------------

function formatTick(timestamp: number | undefined) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (range.value === "7d") {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const xFormatter = (i: number) => formatTick(samples.value[i]?.t);

// --- Chart data ----------------------------------------------------------------

const playersData = computed(() =>
  samples.value.map((s) => ({ t: s.t, players: s.players }))
);
const playersCategories = {
  players: { name: "Players", color: "var(--ui-primary)" },
};

const cpuData = computed(() => samples.value.map((s) => ({ t: s.t, cpu: s.cpu })));
const cpuCategories = { cpu: { name: "CPU", color: "#f97316" } };

const memData = computed(() => samples.value.map((s) => ({ t: s.t, used: s.mem })));
const memCategories = { used: { name: "Used", color: "#8b5cf6" } };

const latencyData = computed(() =>
  samples.value.map((s) => ({ t: s.t, latency: s.latency }))
);
const latencyCategories = { latency: { name: "Latency", color: "#06b6d4" } };
</script>
