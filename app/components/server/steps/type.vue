<template>
  <UPageGrid>
    <UPageCard
      v-for="type in types"
      class="transition-all duration-300 hover:ring-2 hover:ring-primary-500 dark:hover:ring-primary-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 cursor-pointer"
      :class="{
        'ring-2 ring-primary-500 dark:ring-primary-400':
          form.type === type.name,
      }"
      @click="form.type = type.name"
      :key="type.name"
      :title="type.name"
      :description="type.description"
    >
      <template #icon>
        <img :src="type.icon" :alt="type.name" class="size-14" />
      </template>
    </UPageCard>
  </UPageGrid>

  <template v-if="form.type === 'Vanilla'">
    <h1 class="text-md font-bold mt-4">Choose Flavor</h1>
    <UPageGrid>
      <UPageCard
        v-for="flavor in flavors"
        class="transition-all duration-300 hover:ring-2 hover:ring-primary-500 dark:hover:ring-primary-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 cursor-pointer"
        :class="{
          'ring-2 ring-primary-500 dark:ring-primary-400':
            form.flavor === flavor.name,
        }"
        @click="form.flavor = flavor.name"
        :key="flavor.name"
        :title="flavor.name"
        :description="flavor.description"
      >
        <template #icon>
          <img :src="flavor.icon" :alt="flavor.name" class="size-14" />
        </template>
      </UPageCard>
    </UPageGrid>
  </template>
</template>

<script lang="ts" setup>
import vanilla from "~/assets/vanilla.webp";
import ftb from "~/assets/ftb.svg";
import curseforge from "~/assets/curseforge.svg";
import modrinth from "~/assets/modrinth.svg";

import paper from "~/assets/paper.svg";
import fabric from "~/assets/fabric.png";
import forge from "~/assets/forge.svg";

const form = defineModel<Record<string, string>>("form", {
  default: { type: "vanilla", flavor: "" },
});

const types = [
  {
    name: "Vanilla",
    description: "Vanilla Minecraft server.",
    icon: vanilla,
  },
  {
    name: "Feed The Beast",
    description: "Feed The Beast modpack server.",
    icon: ftb,
  },
  {
    name: "CurseForge",
    description: "CurseForge modpack server.",
    icon: curseforge,
  },
  {
    name: "Modrinth",
    description: "Modrinth modpack server.",
    icon: modrinth,
  },
];

const flavors = [
  {
    name: "Paper",
    description:
      "PaperMC enhances Minecraft with fast, secure software, an expanding API, and reliable support.",
    icon: paper,
  },
  {
    name: "Fabric",
    description: "Fabric is a modular, lightweight mod loader for Minecraft",
    icon: fabric,
  },
  {
    name: "Forge",
    description:
      "Minecraft Forge is a free, open-source server that allows players to install and run Minecraft mods.",
    icon: forge,
  },
];
</script>
