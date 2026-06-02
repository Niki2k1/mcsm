<template>
  <div
    class="flex items-center gap-3 rounded-lg border p-3"
    :class="
      accent
        ? 'border-primary/40 bg-primary/5'
        : 'border-default bg-elevated/50'
    "
  >
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-md"
      :class="accent ? 'bg-primary/15 text-primary' : 'bg-accented/50 text-muted'"
    >
      <UIcon :name="icon" class="size-5" />
    </span>
    <div class="min-w-0">
      <p class="truncate font-medium text-highlighted">{{ title }}</p>
      <p class="truncate text-xs text-muted">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string;
  title: string;
  subtitle?: string;
  /** Highlight with the primary color (used for the MCSM/Infrarust nodes). */
  accent?: boolean;
}>();
</script>
