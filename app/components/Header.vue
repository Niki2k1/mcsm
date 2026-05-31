<template>
  <UHeader>
    <template #title>
      <h1 class="text-primary font-bold">Minecraft Server Manager</h1>
      <UBadge label="Beta" variant="subtle" color="error" class="mb-0.5" />
    </template>

    <UNavigationMenu :items="links" />

    <template #right>
      <UButton icon="i-heroicons-plus-20-solid" @click="serverModal.openCreate()">
        Create Server
      </UButton>
    </template>

    <template #body>
      <UNavigationMenu :items="links" orientation="vertical" />
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const serverModal = useServerModal();

const links = [
  { to: "/", label: "Overview", icon: "i-heroicons-squares-2x2-16-solid" },
  { to: "/admin", label: "Admin", icon: "i-heroicons-cog-6-tooth-16-solid" },
];
</script>
