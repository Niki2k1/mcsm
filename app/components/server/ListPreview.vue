<template>
  <!--
    1:1 recreation of a Minecraft multiplayer server-list entry at the default
    GUI scale (2): every measurement below is the in-game GUI unit doubled.
    Source of truth: MultiplayerServerListWidget.ServerEntry.render().
  -->
  <div class="bg-black/90 p-4 select-none overflow-hidden rounded-md">
    <div
      class="group relative mx-auto flex h-[72px] max-w-[610px] cursor-pointer gap-[6px] p-[2px] -m-[2px]"
      :class="{ 'mc-selected': selected }"
      @click="selected = !selected"
    >
      <!-- Icon: 32x32 GUI units = 64x64px, 1:1 with the 64x64 texture -->
      <div class="relative size-16 shrink-0 group/icon">
        <img
          v-if="favicon"
          :src="favicon"
          alt="Server icon"
          class="size-16 [image-rendering:pixelated]"
        />
        <!-- unknown_server stand-in (not Mojang's texture, same role) -->
        <div
          v-else
          class="size-16 bg-[#3c3c3c] flex items-center justify-center font-[Monocraft] text-[32px] text-[#8b8b8b]"
        >
          ?
        </div>

        <!-- Hover: 0xA0909090 overlay + green join arrow -->
        <div
          class="absolute inset-0 hidden group-hover/icon:flex items-center justify-center bg-[#909090]/63"
        >
          <svg
            viewBox="0 0 12 12"
            class="size-8 [image-rendering:pixelated]"
            shape-rendering="crispEdges"
          >
            <!-- pixel-art right arrow, Minecraft join-button green -->
            <path
              d="M4 1h2v2h2v2h2v2H8v2H6v2H4V9h2V7h2V5H6V3H4z"
              fill="#7d7d7d"
              transform="translate(1,1)"
            />
            <path
              d="M4 1h2v2h2v2h2v2H8v2H6v2H4V9h2V7h2V5H6V3H4z"
              fill="#dddddd"
            />
          </svg>
        </div>
      </div>

      <!-- Text block (starts at icon + 3 GUI units) -->
      <div class="min-w-0 flex-1 font-[Monocraft] text-[16px] leading-[18px]">
        <div class="flex items-start justify-between gap-2 pt-[2px]">
          <!-- Name: 0xFFFFFF -->
          <span class="truncate text-white">{{ name || "Minecraft Server" }}</span>

          <span class="flex shrink-0 items-start gap-[6px]">
            <!-- Player count: gray numbers, dark-gray slash -->
            <span v-if="players">
              <span class="text-[#808080]">{{ players.online }}</span
              ><span class="text-[#555555]">/</span
              ><span class="text-[#808080]">{{ players.max }}</span>
            </span>

            <!-- Ping bars: 10x8 GUI units = 20x16px, 5 bars lit by latency -->
            <span
              class="flex h-[16px] w-[20px] items-end gap-[2px]"
              :title="latency != null ? `${latency}ms` : 'no connection'"
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
          <MotdPreview :motd="motd" size="mc" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import MotdPreview from "~/components/server/motd/MotdPreview.vue";

const props = defineProps<{
  name?: string;
  motd: string;
  /** Base64 data URI (from the server ping) or any image URL. */
  favicon?: string | null;
  players?: { online: number; max: number } | null;
  /** Milliseconds; determines how many ping bars are lit (in-game thresholds). */
  latency?: number | null;
}>();

/** Click-to-select like the in-game list (shows the entry outline). */
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
/* Selected entry: black fill with the gray outline Minecraft draws. */
.mc-selected {
  background: rgba(0, 0, 0, 0.75);
  outline: 2px solid #808080;
  outline-offset: 0;
}
.mc-selected:hover {
  outline-color: #ffffff;
}
</style>
