<template>
  <UHeader>
    <template #title>
      <h1 class="text-primary font-bold">MCSM</h1>
      <UBadge label="Beta" variant="subtle" color="error" class="mb-0.5" />
    </template>

    <UNavigationMenu :items="links" />

    <template #right>
      <UserMenu />
    </template>

    <template #body>
      <UNavigationMenu :items="links" orientation="vertical" />
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const { user } = useUserSession();

const links = computed(() => [
  { to: "/", label: "Overview", icon: "i-heroicons-squares-2x2-16-solid" },
  ...(user.value?.admin
    ? [{ to: "/admin", label: "Admin", icon: "i-heroicons-cog-6-tooth-16-solid" }]
    : []),
]);
</script>
