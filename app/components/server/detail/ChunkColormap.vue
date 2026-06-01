<template>
  <div ref="containerEl" class="w-full">
    <canvas
      ref="canvasEl"
      class="block w-full rounded-md ring-1 ring-default [image-rendering:pixelated]"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * Minecraft-style chunk colormap for world pre-generation.
 *
 * Mimics the vanilla "Loading world" screen: each cell is one chunk (or a
 * block of chunks for big radii), colored by generation status. Chunky
 * generates concentric square rings outward from the center, so completed
 * chunks render as a white square growing from the middle, with a band of
 * in-progress stage colors at the frontier and untouched chunks in dark gray.
 *
 * Pure renderer — all data comes in via props, nothing is fetched here.
 */
const props = defineProps<{
  /** Square radius of the pre-generated area, in blocks. */
  radiusBlocks: number;
  /** Chunks Chunky has processed so far. */
  processed: number;
  /** Task state: idle | running | paused | completed | cancelled | failed. */
  state: string;
  /** Center of the area, in blocks. */
  centerX?: number;
  centerZ?: number;
  /** Absolute chunk position Chunky is currently working on. */
  current?: { x: number; z: number } | null;
}>();

// --- Palette (minecraft.wiki/w/Loading_world_screen) -------------------------

const COLOR_EMPTY = "#545454";
const COLOR_FULL = "#FFFFFF";
/** Vanilla's "spawn" red — reused to highlight Chunky's current chunk. */
const COLOR_CURRENT = "#F26060";
/**
 * Generation stages drawn behind the frontier, from the outermost band
 * (structures) to the innermost (light) — the same inward progression the
 * real loading screen shows.
 */
const STAGE_BANDS: string[][] = [
  ["#999999", "#5F6191"], // structure starts / references
  ["#80B252", "#D1D1D1", "#726809"], // biomes / noise / surface
  ["#303572", "#21C600", "#CCCCCC"], // carvers / features / light init
  ["#FFE0A0", "#CCCCCC"], // light
];

// --- Grid geometry -----------------------------------------------------------

/** Chunky generates a (2·⌈r/16⌉+1)² chunk square. */
const sideChunks = computed(
  () => 2 * Math.ceil(Math.max(props.radiusBlocks, 16) / 16) + 1
);

/** Cap drawn cells for huge radii — each drawn cell then covers f×f chunks. */
const MAX_DRAW_SIDE = 199;
const downsample = computed(() =>
  Math.max(1, Math.ceil(sideChunks.value / MAX_DRAW_SIDE))
);
const drawSide = computed(() => Math.ceil(sideChunks.value / downsample.value));

// --- Rendering ----------------------------------------------------------------

const containerEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

let resizeObserver: ResizeObserver | null = null;
let rafId: number | null = null;
let lastShimmerFrame = -1;
/** Fill count animated toward `props.processed` for a smooth wave. */
let displayProcessed = 0;

/** Deterministic per-cell hash for stage-color jitter. */
function cellHash(col: number, row: number) {
  let h = (col * 374761393 + row * 668265263) ^ ((col ^ row) * 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return (h ^ (h >>> 16)) >>> 0;
}

function draw(timestamp: number) {
  const canvas = canvasEl.value;
  const container = containerEl.value;
  if (!canvas || !container) return;

  const cssSize = container.clientWidth;
  if (!cssSize) return;

  const dpr = window.devicePixelRatio || 1;
  const px = Math.round(cssSize * dpr);
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  canvas.style.height = `${cssSize}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const side = drawSide.value;
  const factor = downsample.value;
  const totalChunks = sideChunks.value ** 2;
  const running = props.state === "running";
  const completed = props.state === "completed";
  const hasTask = running || props.state === "paused" || completed;

  // Ease the displayed count toward the live one so updates flow instead of
  // jumping every poll.
  const target = completed
    ? totalChunks
    : Math.min(hasTask ? props.processed : 0, totalChunks);
  displayProcessed += (target - displayProcessed) * 0.2;
  if (Math.abs(target - displayProcessed) < 1) displayProcessed = target;

  // Frontier math in chunk-ring space: ring k holds (2k+1)² − (2k−1)² chunks;
  // all rings through k hold (2k+1)² total.
  const processed = displayProcessed;
  const completeRing =
    processed >= 1 ? Math.floor((Math.sqrt(processed) - 1) / 2) : -1;
  const frontier = completeRing + 1;
  const innerCount = completeRing >= 0 ? (2 * completeRing + 1) ** 2 : 0;
  const frontierSize = (2 * frontier + 1) ** 2 - innerCount;
  const frontierFill =
    frontierSize > 0 ? (processed - innerCount) / frontierSize : 0;

  // Shimmer advances every 150ms while running.
  const shimmer = running ? Math.floor(timestamp / 150) : 0;

  // Background (the gaps between cells).
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, px, px);

  const cell = px / side;
  const gap = cell >= 4 ? Math.max(1, Math.floor(cell * 0.12)) : 0;
  const center = (side - 1) / 2;

  // Chunky's current chunk in draw space.
  let currentCol = -1;
  let currentRow = -1;
  if (props.current && running) {
    const centerChunkX = Math.floor((props.centerX ?? 0) / 16);
    const centerChunkZ = Math.floor((props.centerZ ?? 0) / 16);
    currentCol = Math.round((props.current.x - centerChunkX) / factor + center);
    currentRow = Math.round((props.current.z - centerChunkZ) / factor + center);
  }

  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      // Ring of this cell in chunk space (Chebyshev distance from center).
      const dx = (col - center) * factor;
      const dz = (row - center) * factor;
      const ring = Math.round(Math.max(Math.abs(dx), Math.abs(dz)));

      let color: string;
      if (completed || ring < frontier) {
        color = COLOR_FULL;
      } else if (hasTask && ring === frontier) {
        // The frontier ring fills clockwise from the top.
        const angle = Math.atan2(dx, -dz) / (2 * Math.PI);
        const position = angle < 0 ? angle + 1 : angle;
        if (position <= frontierFill) {
          color = COLOR_FULL;
        } else if (running) {
          const band = STAGE_BANDS[3]!;
          color = band[(cellHash(col, row) + shimmer) % band.length]!;
        } else {
          color = COLOR_EMPTY;
        }
      } else if (running) {
        // Stage bands expanding ahead of the frontier, like vanilla's screen.
        const ahead = ring - frontier;
        if (ahead <= 0) {
          color = COLOR_FULL;
        } else if (ahead <= 2) {
          const band = STAGE_BANDS[2]!;
          color = band[(cellHash(col, row) + shimmer) % band.length]!;
        } else if (ahead <= 4) {
          const band = STAGE_BANDS[1]!;
          color =
            band[(cellHash(col, row) + Math.floor(shimmer / 2)) % band.length]!;
        } else if (ahead <= 6) {
          const band = STAGE_BANDS[0]!;
          color = band[cellHash(col, row) % band.length]!;
        } else {
          color = COLOR_EMPTY;
        }
      } else {
        color = COLOR_EMPTY;
      }

      if (row === currentRow && col === currentCol) {
        color = COLOR_CURRENT;
      }

      ctx.fillStyle = color;
      ctx.fillRect(
        Math.round(col * cell),
        Math.round(row * cell),
        Math.max(1, Math.round(cell - gap)),
        Math.max(1, Math.round(cell - gap))
      );
    }
  }
}

// --- Animation loop -----------------------------------------------------------

function tick(timestamp: number) {
  rafId = requestAnimationFrame(tick);

  // Redraw only when the shimmer frame advances or the fill is still easing —
  // ~7 fps is plenty and keeps big grids cheap.
  const frame = Math.floor(timestamp / 150);
  const totalChunks = sideChunks.value ** 2;
  const target =
    props.state === "completed"
      ? totalChunks
      : Math.min(props.processed, totalChunks);
  const easing = Math.abs(target - displayProcessed) >= 1;

  if (frame !== lastShimmerFrame || easing) {
    lastShimmerFrame = frame;
    draw(timestamp);
  }
}

function startLoop() {
  if (rafId === null) rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

watch(
  () => [props.state, props.processed, props.radiusBlocks],
  () => {
    // Animate continuously while running (shimmer); otherwise draw on demand.
    if (props.state === "running") {
      startLoop();
    } else {
      stopLoop();
      requestAnimationFrame(draw);
    }
  }
);

onMounted(() => {
  resizeObserver = new ResizeObserver(() => requestAnimationFrame(draw));
  if (containerEl.value) resizeObserver.observe(containerEl.value);

  if (props.state === "running") startLoop();
  else requestAnimationFrame(draw);
});

onBeforeUnmount(() => {
  stopLoop();
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>
