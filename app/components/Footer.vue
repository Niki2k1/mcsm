<template>
  <UFooter>
    <template #top>
      <UFooterColumns :links="links" />
    </template>

    <template #left>
      <p class="text-gray-500 dark:text-gray-400 text-sm">
        Built with 🩵 by Niklas
      </p>
    </template>

    <template #center>
      <UColorModeButton size="sm" />
    </template>

    <template #right>
      <UButton
        icon="i-simple-icons-x"
        color="gray"
        variant="ghost"
        to="https://x.com/niki2k1"
        target="_blank"
      />
      <UButton
        icon="i-simple-icons-instagram"
        color="gray"
        variant="ghost"
        to="https://instagram.com/niki2k1"
        target="_blank"
      />
      <UButton
        icon="i-simple-icons-github"
        color="gray"
        variant="ghost"
        to="https://github.com/Niki2k1"
        target="_blank"
      />
    </template>
  </UFooter>
</template>

<script setup lang="ts">
const links = [
  {
    label: "📚 Libraries",
    children: [
      {
        label: "minecraft-data",
        to: "https://github.com/PrismarineJS/minecraft-data",
        target: "_blank",
      },
      {
        label: "minecraft-motd-parser",
        to: "https://github.com/SnowFireWolf/minecraft-motd-parser",
        target: "_blank",
      },
      {
        label: "skin-spec",
        to: "https://github.com/minotar/skin-spec",
        target: "_blank",
      },
      {
        label: "Monocraft",
        to: "https://github.com/IdreesInc/Monocraft",
        target: "_blank",
      },
    ],
  },
  {
    label: "❤️ Special Thanks",
    children: [
      {
        label: "Coolify",
        to: "https://coolify.io",
        target: "_blank",
      },
      {
        label: "Infrared",
        to: "https://infrared.dev",
        target: "_blank",
      },
      {
        label: "Nuxt Coolify",
        to: "https://github.com/justserdar/nuxt-coolify",
        target: "_blank",
      },
    ],
  },
];
</script>
