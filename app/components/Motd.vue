<template>
  <p class="mb-2 font-[Monocraft] text-sm" v-html="motdParser(motd)" />
</template>

<script lang="ts" setup>
const motdParser = useMotdParser();

defineProps<{
  motd: string;
}>();

const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
const obfuscated_animation_request_id = ref<number | null>(null);

onMounted(() => {
  if (!prefersReducedMotion.value) {
    animate_obfuscated_text();
  }
});

onUnmounted(() => {
  if (obfuscated_animation_request_id.value !== null) {
    window.cancelAnimationFrame(obfuscated_animation_request_id.value);
  }
});

/**
 * Animates the obfuscated text in the MOTD
 * Credits to: https://mctools.org/motd-creator
 */
function animate_obfuscated_text() {
  obfuscated_animation_request_id.value = window.requestAnimationFrame(
    animate_obfuscated_text
  );

  const spansToAnimate = document.querySelectorAll('span[style*="obfuscated"]');

  for (const span of spansToAnimate) {
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const text = walker.currentNode.nodeValue;
      if (text?.trim()) {
        let random_string = "";
        for (let x = 0; x < text.length; x++)
          random_string += String.fromCharCode(
            Math.floor(Math.random() * (95 - 64 + 1)) + 64
          );
        walker.currentNode.nodeValue = random_string;
      }
    }
  }
}
</script>

<style></style>
