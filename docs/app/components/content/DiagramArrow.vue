<template>
  <div class="flex flex-col items-center py-1.5">
    <span class="h-3 w-px bg-accented" />
    <span
      class="my-0.5 max-w-full truncate rounded-full border border-default bg-elevated px-2.5 py-0.5 text-[11px] text-muted"
      :title="label"
    >
      {{ label }}
    </span>
    <span class="h-3 w-px bg-accented" />
    <UIcon name="i-lucide-chevron-down" class="-mt-1.5 size-3.5 text-dimmed" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
}>();
</script>
