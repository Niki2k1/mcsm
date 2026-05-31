<template>
  <UBadge
    :color="value ? 'green' : 'gray'"
    variant="subtle"
    :icon="value ? 'i-heroicons-check-20-solid' : 'i-heroicons-x-mark-20-solid'"
  >
    {{ value ? "Enabled" : "Disabled" }}
  </UBadge>
</template>

<script setup lang="ts">
defineProps<{
  value: boolean;
}>();
</script>
