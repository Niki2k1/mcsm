<template>
  <div
    ref="root"
    class="font-[Monocraft]"
    :class="size === 'mc' ? 'text-[16px] leading-[18px]' : 'text-sm leading-snug'"
  >
    <div
      v-for="(line, li) in lines"
      :key="li"
      :class="size === 'mc' ? 'min-h-[18px]' : 'min-h-[1.2em]'"
    >
      <span
        v-for="(run, ri) in line"
        :key="ri"
        :class="{ 'motd-obf': run.obf }"
        :style="run.style"
        >{{ run.text }}</span
      >
      <span v-if="!line.length">&nbsp;</span>
    </div>
  </div>
</template>

<script setup lang="ts">
// Mirror of the MCSM app's MotdPreview.vue: renders a legacy `§`-coded MOTD
// string (including 1.16+ hex colors) exactly like the in-game server list.
import { motdToJson } from "~/utils/motd";

const props = defineProps<{
  motd: string;
  /**
   * `mc` renders at Minecraft's own proportions (GUI scale 2: 16px glyphs,
   * 18px line height) for the 1:1 in-game server list preview.
   */
  size?: "sm" | "mc";
}>();

interface Run {
  text: string;
  obf: boolean;
  style: Record<string, string>;
}

const lines = computed<Run[][]>(() => {
  const doc = motdToJson(props.motd);
  return doc.content.map((para) =>
    (para.content ?? [])
      .filter((node) => node.type === "text")
      .map((node) => {
        const marks = node.marks ?? [];
        const has = (type: string) => marks.some((m) => m.type === type);
        const color = marks.find((m) => m.type === "textStyle")?.attrs?.color;

        const decoration = [
          has("underline") ? "underline" : "",
          has("strike") ? "line-through" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const style: Record<string, string> = {};
        if (typeof color === "string") style.color = color;
        if (has("bold")) style.fontWeight = "bold";
        if (has("italic")) style.fontStyle = "italic";
        if (decoration) style.textDecoration = decoration;

        return { text: node.text ?? "", obf: has("obfuscated"), style };
      })
  );
});

// Scramble obfuscated runs at 60fps, matching the in-game `§k` effect.
const root = useTemplateRef<HTMLElement>("root");
// The app uses @vueuse's useMediaQuery here; plain matchMedia avoids the extra
// dependency in the docs (checked client-side only, where animation runs).
const prefersReducedMotion = ref(false);
onMounted(() => {
  prefersReducedMotion.value = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
});
const hasObfuscated = computed(() =>
  lines.value.some((line) => line.some((run) => run.obf))
);
let frame: number | null = null;

const animate = () => {
  const el = root.value;
  if (!el) return;
  frame = window.requestAnimationFrame(animate);

  for (const span of el.querySelectorAll<HTMLElement>(".motd-obf")) {
    const len = span.textContent?.length ?? 0;
    let scrambled = "";
    for (let x = 0; x < len; x++) {
      scrambled += String.fromCharCode(
        Math.floor(Math.random() * (95 - 64 + 1)) + 64
      );
    }
    span.textContent = scrambled;
  }
};

const stop = () => {
  if (frame !== null) {
    window.cancelAnimationFrame(frame);
    frame = null;
  }
};
const start = () => {
  if (frame === null && !prefersReducedMotion.value) animate();
};

watch(hasObfuscated, (on) => (on ? start() : stop()));
onMounted(() => {
  if (hasObfuscated.value) start();
});
onBeforeUnmount(stop);
</script>
