<template>
  <UDashboardPanelContent class="pb-24">
    <UDashboardSection title="Review">
      {{ form }}
    </UDashboardSection>
  </UDashboardPanelContent>
</template>

<script setup lang="ts">
const form = defineModel<Record<string, string>>("form", {
  default: {},
});
</script>
