<template>
  <p class="mb-2 font-[Monocraft] text-sm" v-html="motdParser(motd)" />
</template>

<script lang="ts" setup>
const motdParser = useMotdParser();

defineProps<{
  motd: string;
}>();

const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
const obfuscated_animation_request_id = ref(null);

onMounted(() => {
  if (!prefersReducedMotion.value) {
    animate_obfuscated_text();
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
    let walker = document.createTreeWalker(
      span,
      NodeFilter.SHOW_TEXT,
      null,
      !1
    );

    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.trim()) {
        let random_string = "";
        for (let x = 0; x < walker.currentNode.nodeValue.length; x++)
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
