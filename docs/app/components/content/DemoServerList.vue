<template>
  <!--
    1:1 recreation of a Minecraft multiplayer server-list entry, taken straight
    from the MCSM dashboard (ListPreview.vue). Click the entry to select it,
    hover the icon for the join arrow — just like in-game.
  -->
  <div class="bg-black/90 p-4 select-none overflow-hidden rounded-md not-prose">
    <div
      class="group relative mx-auto flex h-[72px] max-w-[610px] cursor-pointer gap-[6px] p-[2px] -m-[2px]"
      :class="{ 'mc-selected': selected }"
      @click="selected = !selected"
    >
      <!-- Icon: 32x32 GUI units = 64x64px -->
      <div class="relative size-16 shrink-0 group/icon">
        <img
          v-if="favicon"
          :src="favicon"
          alt="Server icon"
          class="size-16 [image-rendering:pixelated]"
        />
        <div
          v-else
          class="size-16 bg-[#3c3c3c] flex items-center justify-center font-[Monocraft] text-[32px] text-[#8b8b8b]"
        >
          ?
        </div>

        <!-- Hover: overlay + green join arrow -->
        <div
          class="absolute inset-0 hidden group-hover/icon:flex items-center justify-center bg-[#909090]/63"
        >
          <svg
            viewBox="0 0 12 12"
            class="size-8 [image-rendering:pixelated]"
            shape-rendering="crispEdges"
          >
            <path
              d="M4 1h2v2h2v2h2v2H8v2H6v2H4V9h2V7h2V5H6V3H4z"
              fill="#7d7d7d"
              transform="translate(1,1)"
            />
            <path d="M4 1h2v2h2v2h2v2H8v2H6v2H4V9h2V7h2V5H6V3H4z" fill="#dddddd" />
          </svg>
        </div>
      </div>

      <!-- Text block -->
      <div class="min-w-0 flex-1 font-[Monocraft] text-[16px] leading-[18px]">
        <div class="flex items-start justify-between gap-2 pt-[2px]">
          <span class="truncate text-white">{{ name }}</span>

          <span class="flex shrink-0 items-start gap-[6px]">
            <span>
              <span class="text-[#808080]">{{ playersOnline }}</span
              ><span class="text-[#555555]">/</span
              ><span class="text-[#808080]">{{ playersMax }}</span>
            </span>

            <!-- Ping bars: lit by latency, in-game thresholds -->
            <span
              class="flex h-[16px] w-[20px] items-end gap-[2px]"
              :title="`${latency}ms`"
            >
              <span
                v-for="bar in 5"
                :key="bar"
                class="w-[2px]"
                :style="{
                  height: `${4 + bar * 2}px`,
                  backgroundColor: bar <= litBars ? '#00c800' : '#2b2b2b',
                }"
              />
            </span>
          </span>
        </div>

        <!-- MOTD: 2 lines max, base color 0x808080 -->
        <div class="mt-[4px] text-[#808080]">
          <MotdRender :motd="motd" size="mc" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name?: string;
    motd?: string;
    favicon?: string | null;
    playersOnline?: number;
    playersMax?: number;
    /** Milliseconds; determines how many ping bars are lit (in-game thresholds). */
    latency?: number;
  }>(),
  {
    name: "Snapshot Party",
    motd: "§6⚡ §aSurvival §7— §bSeason 4§r §7starts §enow§7!\n§d§k!!§r §fFresh world §7· §cNo resets §7· §d§k!!",
    favicon: null,
    playersOnline: 12,
    playersMax: 20,
    latency: 23,
  }
);

/** Click-to-select like the in-game list (shows the gray outline). */
const selected = ref(false);

/** In-game thresholds from PingBars#draw. */
const litBars = computed(() => {
  const ms = props.latency;
  if (ms == null || ms < 0) return 0;
  if (ms < 150) return 5;
  if (ms < 300) return 4;
  if (ms < 600) return 3;
  if (ms < 1000) return 2;
  return 1;
});
</script>

<style scoped>
.mc-selected {
  background: rgba(0, 0, 0, 0.75);
  outline: 2px solid #808080;
  outline-offset: 0;
}
.mc-selected:hover {
  outline-color: #ffffff;
}
</style>
