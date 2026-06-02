<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
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
