<template>
  <div ref="root" class="font-[Monocraft] text-sm leading-snug">
    <div v-for="(line, li) in lines" :key="li" class="min-h-[1.2em]">
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
import { motdToJson } from "~/utils/motd";

const props = defineProps<{ motd: string }>();

interface Run {
  text: string;
  obf: boolean;
  style: Record<string, string>;
}

/**
 * Render the MOTD straight from our own codec so it matches exactly what we
 * serialise — including 1.16+ truecolour, which the upstream preview parser
 * doesn't understand.
 */
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

// Scramble obfuscated runs, matching the in-game effect. Mirrors Motd.vue, but
// only runs while there's actually obfuscated text (the server list mounts many
// of these, so we don't want idle animation loops).
const root = useTemplateRef<HTMLElement>("root");
const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
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
      scrambled += String.fromCharCode(Math.floor(Math.random() * (95 - 64 + 1)) + 64);
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
