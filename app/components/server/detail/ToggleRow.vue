<template>
  <div class="flex items-center justify-between gap-4">
    <div class="min-w-0">
      <p class="text-sm font-medium">{{ label }}</p>
      <p class="text-xs text-muted">{{ description }}</p>
    </div>
    <USwitch v-model="model" />
  </div>
</template>

<script setup lang="ts">
/** A labelled switch row used throughout the Configuration tab. */
defineProps<{
  label: string;
  description: string;
}>();

const model = defineModel<boolean>({ required: true });
</script>
