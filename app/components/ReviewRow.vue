<template>
  <div class="grid grid-cols-3 gap-4 px-4 py-3">
    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">
      {{ label }}
    </dt>
    <dd class="col-span-2 text-sm text-gray-900 dark:text-white">
      <slot />
    </dd>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
}>();
</script>
