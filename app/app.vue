<template>
  <UApp>
    <Header />

    <UMain>
      <NuxtPage />
    </UMain>

    <Footer />

    <!-- Shared create/edit wizard, opened from the header and the dashboard. -->
    <ServerFormModal />

    <!-- Server console (log stream + RCON), opened from a server card. -->
    <ServerConsoleModal />
  </UApp>
</template>

<script setup lang="ts">
useSeoMeta({
  title: "Minecraft Server Manager",
  description: "Create your own Minecraft server with just a few clicks.",
});

useHead({
  link: [
    {
      rel: "icon",
      type: "image/png",
      href: "/favicon.png",
    },
  ],
});
</script>
