<!-- Decorative interactive grid background used on the auth pages. -->
<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    width?: number;
    height?: number;
    squares?: [number, number];
    squaresClass?: string;
  }>(),
  {
    width: 40,
    height: 40,
    squares: () => [24, 24],
    squaresClass: "",
  }
);

const [horizontal, vertical] = props.squares;
const hovered = ref<number | null>(null);
</script>

<template>
  <svg
    :width="width * horizontal"
    :height="height * vertical"
    class="absolute inset-0 h-full w-full border border-gray-400/30"
  >
    <rect
      v-for="(_, i) in horizontal * vertical"
      :key="i"
      :x="(i % horizontal) * width"
      :y="Math.floor(i / horizontal) * height"
      :width="width"
      :height="height"
      :class="[
        'stroke-gray-400/30 transition-all duration-100 ease-in-out',
        hovered === i ? 'fill-gray-300/30' : 'fill-transparent',
        squaresClass,
      ]"
      @mouseenter="hovered = i"
      @mouseleave="hovered = null"
    />
  </svg>
</template>
