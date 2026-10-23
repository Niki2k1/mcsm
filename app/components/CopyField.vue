<!-- Read-only monospace value with a copy button (endpoints, tokens, CLI commands). -->
<template>
  <div class="flex items-center gap-2">
    <code
      class="min-w-0 flex-1 truncate rounded-md bg-elevated px-2 py-1.5 font-mono text-xs"
      :title="value"
      >{{ value }}</code
    >
    <UButton
      :icon="
        copied ? 'i-heroicons-check-20-solid' : 'i-heroicons-clipboard-20-solid'
      "
      :color="copied ? 'success' : 'neutral'"
      variant="soft"
      size="sm"
      aria-label="Copy"
      @click="copy"
    />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ value: string }>();

const copied = ref(false);

async function copy() {
  await navigator.clipboard.writeText(props.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}
</script>
