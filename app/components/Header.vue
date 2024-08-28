<template>
  <UHeader :links>
    <template #logo>
      <h1 class="text-primary">Minecraft Server Manager</h1>
      <UBadge label="Beta" variant="subtle" color="red" class="mb-0.5" />
    </template>

    <template #center>
      <div class="hidden lg:block">
        <HeaderBtn v-for="link in links" v-bind="link">
          {{ link.label }}
        </HeaderBtn>
      </div>
    </template>

    <template #right>
      <UButton to="/servers/create" icon="i-heroicons-plus-20-solid">
        Create Server
      </UButton>
    </template>

    <template #panel>
      <UAsideLinks :links="links" />
    </template>
  </UHeader>
</template>

<script setup lang="ts">
const links = [
  { to: "/", label: "Overview", icon: "i-heroicons-squares-2x2-16-solid" },
  // {
  //   to: "/servers",
  //   label: "Servers",
  //   icon: "i-heroicons-server-stack-16-solid",
  // },
  // { to: "/settings", label: "Settings", icon: "i-heroicons-cog-16-solid" },
];
</script>
