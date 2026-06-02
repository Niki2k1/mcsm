<template>
  <div class="w-full">
    <svg
      :viewBox="`0 0 ${SIZE} ${SIZE}`"
      class="block w-full rounded-md bg-neutral-950 ring-1 ring-default"
    >
      <defs>
        <clipPath :id="clipId">
          <rect :x="PAD" :y="PAD" :width="INNER" :height="INNER" />
        </clipPath>
      </defs>

      <!-- Area being pre-generated -->
      <rect
        :x="PAD"
        :y="PAD"
        :width="INNER"
        :height="INNER"
        class="fill-white/[0.02] stroke-white/15"
        stroke-width="0.5"
      />

      <g :clip-path="`url(#${clipId})`">
        <!-- Region grid (512×512 blocks, aligned to absolute region borders) -->
        <line
          v-for="x in regionGridX"
          :key="`x${x}`"
          :x1="x"
          :y1="PAD"
          :x2="x"
          :y2="SIZE - PAD"
          class="stroke-white/[0.06]"
          stroke-width="0.4"
        />
        <line
          v-for="y in regionGridZ"
          :key="`y${y}`"
          :x1="PAD"
          :y1="y"
          :x2="SIZE - PAD"
          :y2="y"
          class="stroke-white/[0.06]"
          stroke-width="0.4"
        />

        <!-- Completed: the whole area is done -->
        <rect
          v-if="state === 'completed'"
          :x="PAD"
          :y="PAD"
          :width="INNER"
          :height="INNER"
          :fill="PRIMARY"
          opacity="0.25"
        />

        <!-- Regions Chunky was observed working in (accumulated, real data) -->
        <template v-else>
          <rect
            v-for="region in visitedRects"
            :key="region.key"
            :x="region.x"
            :y="region.y"
            :width="region.size"
            :height="region.size"
            :fill="PRIMARY"
            :opacity="region.current ? 0.45 : 0.18"
            rx="0.5"
          />
        </template>

        <!-- Center of the area -->
        <g class="stroke-white/40" stroke-width="0.5">
          <line :x1="CENTER - 2" :y1="CENTER" :x2="CENTER + 2" :y2="CENTER" />
          <line :x1="CENTER" :y1="CENTER - 2" :x2="CENTER" :y2="CENTER + 2" />
        </g>

        <!-- Chunky's current position -->
        <g v-if="currentPoint">
          <circle
            :cx="currentPoint.x"
            :cy="currentPoint.y"
            r="1.5"
            :fill="PRIMARY"
          >
            <animate
              v-if="state === 'running'"
              attributeName="r"
              values="1.5;6"
              dur="1.6s"
              repeatCount="indefinite"
            />
            <animate
              v-if="state === 'running'"
              attributeName="opacity"
              values="0.7;0"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </circle>
          <circle
            :cx="currentPoint.x"
            :cy="currentPoint.y"
            r="1.5"
            :fill="PRIMARY"
            class="stroke-white/60"
            stroke-width="0.4"
          />
        </g>
      </g>

      <!-- Progress, front and center -->
      <text
        v-if="percent != null && state !== 'idle'"
        :x="CENTER"
        :y="CENTER - 4"
        text-anchor="middle"
        class="fill-white/90 font-semibold"
        style="font-size: 14px"
      >
        {{ percent.toFixed(state === 'completed' ? 0 : 1) }}%
      </text>

      <!-- Corner coordinates for scale -->
      <text :x="PAD + 1.5" :y="PAD + 4" class="fill-white/30" style="font-size: 3.5px">
        {{ cornerLabel(-1) }}
      </text>
      <text
        :x="SIZE - PAD - 1.5"
        :y="SIZE - PAD - 2"
        text-anchor="end"
        class="fill-white/30"
        style="font-size: 3.5px"
      >
        {{ cornerLabel(1) }}
      </text>
    </svg>

    <!-- Caption -->
    <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <span>
        {{ (radiusBlocks * 2).toLocaleString() }} × {{ (radiusBlocks * 2).toLocaleString() }}
        blocks · grid = 512-block regions
      </span>
      <span v-if="state === 'running' && current" class="font-mono">
        working at {{ current.x * 16 }}, {{ current.z * 16 }}
      </span>
      <span v-else-if="state === 'completed'">fully generated</span>
    </div>

    <!-- Legend -->
    <div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-full" :style="{ backgroundColor: 'var(--ui-primary)' }" />
        Chunky's position
      </span>
      <span class="flex items-center gap-1.5">
        <span
          class="size-2.5 rounded-[2px]"
          :style="{ backgroundColor: 'var(--ui-primary)', opacity: 0.3 }"
        />
        Regions worked on
      </span>
      <span class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-[2px] bg-white/10 ring-1 ring-white/20" />
        Remaining area
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Honest pre-generation map.
 *
 * Chunky only reports a processed count, a rate/ETA and its current chunk
 * position — so that's exactly what this draws: the area being generated, the
 * regions we've actually observed Chunky working in (accumulated from polls
 * while the page is open), and its live position. Overall progress is a
 * number, not a guessed fill pattern.
 */
const props = defineProps<{
  /** Square radius of the pre-generated area, in blocks. */
  radiusBlocks: number;
  /** Task state: idle | running | paused | completed | cancelled | failed. */
  state: string;
  /** Completion percentage (shown in the center). */
  percent?: number | null;
  /** Center of the area, in blocks. */
  centerX?: number;
  centerZ?: number;
  /** Absolute chunk position Chunky is currently working on. */
  current?: { x: number; z: number } | null;
}>();

// --- Geometry -------------------------------------------------------------------

const SIZE = 200;
const PAD = 6;
const INNER = SIZE - PAD * 2;
const CENTER = SIZE / 2;
const PRIMARY = "var(--ui-primary)";
const REGION_BLOCKS = 512;

const clipId = useId();

const radius = computed(() => Math.max(props.radiusBlocks, 16));

/** SVG units per block. */
const scale = computed(() => INNER / (radius.value * 2));

/** Block coordinate (absolute) → SVG coordinate. */
function blockToSvg(x: number, z: number) {
  return {
    x: CENTER + (x - (props.centerX ?? 0)) * scale.value,
    y: CENTER + (z - (props.centerZ ?? 0)) * scale.value,
  };
}

/** Chunk position → SVG point at the chunk's center. */
const currentPoint = computed(() => {
  if (!props.current) return null;
  if (props.state !== "running" && props.state !== "paused") return null;
  return blockToSvg(props.current.x * 16 + 8, props.current.z * 16 + 8);
});

/** Region grid lines at absolute 512-block boundaries inside the area. */
const regionGridX = computed(() => gridLines(props.centerX ?? 0, (x) => blockToSvg(x, 0).x));
const regionGridZ = computed(() => gridLines(props.centerZ ?? 0, (z) => blockToSvg(0, z).y));

function gridLines(center: number, toSvg: (block: number) => number): number[] {
  const lines: number[] = [];
  const first = Math.ceil((center - radius.value) / REGION_BLOCKS) * REGION_BLOCKS;
  for (let block = first; block <= center + radius.value; block += REGION_BLOCKS) {
    lines.push(toSvg(block));
  }
  return lines;
}

// --- Observed activity ----------------------------------------------------------

/** Regions (32×32 chunks) we've seen Chunky working in: "rx,rz". */
const visited = ref(new Set<string>());

watch(
  () => props.current,
  (pos) => {
    if (!pos || props.state !== "running") return;
    visited.value.add(`${Math.floor(pos.x / 32)},${Math.floor(pos.z / 32)}`);
    // Trigger reactivity on the Set.
    visited.value = new Set(visited.value);
  }
);

// A new task (or reset) starts a fresh observation map. Resuming from pause
// keeps what was already observed.
watch(
  () => props.state,
  (state, oldState) => {
    const startedFresh =
      state === "running" && oldState !== "paused" && oldState !== "running";
    if (state === "idle" || startedFresh) visited.value = new Set();
  }
);

const currentRegionKey = computed(() =>
  props.current
    ? `${Math.floor(props.current.x / 32)},${Math.floor(props.current.z / 32)}`
    : null
);

const visitedRects = computed(() => {
  const rects: { key: string; x: number; y: number; size: number; current: boolean }[] = [];
  const size = REGION_BLOCKS * scale.value;
  for (const key of visited.value) {
    const [rx = 0, rz = 0] = key.split(",").map(Number);
    const topLeft = blockToSvg(rx * REGION_BLOCKS, rz * REGION_BLOCKS);
    rects.push({
      key,
      x: topLeft.x,
      y: topLeft.y,
      size,
      current: props.state === "running" && key === currentRegionKey.value,
    });
  }
  return rects;
});

// --- Labels -----------------------------------------------------------------------

function cornerLabel(sign: 1 | -1) {
  const x = (props.centerX ?? 0) + sign * radius.value;
  const z = (props.centerZ ?? 0) + sign * radius.value;
  return `${x.toLocaleString()}, ${z.toLocaleString()}`;
}
</script>
