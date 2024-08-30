<template>
  <UPageGrid>
    <UPageCard
      v-for="type in types"
      class="transition-all duration-200 cursor-pointer"
      :class="{
        'ring-2 ring-primary-500 dark:ring-primary-400':
          form.type === type.value,
        'hover:ring-2 hover:ring-primary-500 dark:hover:ring-primary-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50':
          !type.disabled,
        'opacity-50': type.disabled,
        'cursor-not-allowed': type.disabled,
      }"
      @click="!type.disabled && (form.type = type.value)"
      :key="type.name"
      :title="type.name"
      :description="type.description"
    >
      <template #icon>
        <img :src="type.icon" :alt="type.name" class="size-14" />
      </template>
    </UPageCard>
  </UPageGrid>

  <template v-if="choosenType?.customFields?.length">
    <UDashboardSection>
      <template #title>
        <h1 class="text-md font-bold mt-4">
          Settings for <span class="text-primary">{{ choosenType?.name }}</span>
        </h1>
      </template>
      <UFormGroup
        v-for="field in choosenType?.customFields"
        :key="field.name"
        :name="field.name"
        :label="field.label"
        :required="field.required"
        class="grid grid-cols-2 gap-2"
        :ui="{ container: '' }"
      >
        <USelectMenu
          v-model="form.VERSION"
          v-if="field.type === 'version'"
          :options="versionOptions"
        />
        <UInput v-model="form[field.name]" :type="field.type" v-else />
      </UFormGroup>
    </UDashboardSection>
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

const form = useCreateForm();

const { data: versionOptions } = useFetch("/api/minecraft/versions", {
  default: () => [],
});

const types = [
  {
    name: "Vanilla",
    value: "VANILLA",
    description: "Vanilla Minecraft server.",
    icon: vanilla,
    customFields: [
      {
        name: "VERSION",
        label: "Version",
        required: true,
        type: "version",
      },
    ],
  },
  {
    name: "Feed The Beast",
    value: "FTBA",
    description: "Feed The Beast modpack server.",
    icon: ftb,
    customFields: [
      {
        name: "FTB_MODPACK_ID",
        label: "Modpack ID",
        required: true,
        type: "text",
      },
      {
        name: "FTB_MODPACK_VERSION_ID",
        label: "Modpack Version ID",
        required: false,
        type: "text",
      },
    ],
  },
  {
    name: "CurseForge",
    value: "AUTO_CURSEFORGE",
    description: "CurseForge modpack server.",
    icon: curseforge,
    customFields: [
      {
        name: "CF_SLUG",
        label: "Slug",
        required: true,
        type: "text",
        placeholder: "all-the-mods-8",
      },
      {
        name: "CF_API_KEY",
        label: "API Key",
        required: true,
        type: "password",
      },
      {
        name: "CF_FILE_ID",
        label: "File ID",
        type: "text",
      },
    ],
  },
  {
    name: "Modrinth",
    value: "MODRINTH",
    description: "Modrinth modpack server.",
    icon: modrinth,
    disabled: true,
  },
  {
    name: "Paper",
    value: "PAPER",
    description:
      "PaperMC enhances Minecraft with fast, secure software, an expanding API, and reliable support.",
    icon: paper,
  },
  {
    name: "Fabric",
    value: "FABRIC",
    description: "Fabric is a modular, lightweight mod loader for Minecraft",
    icon: fabric,
  },
  {
    name: "Forge",
    value: "FORGE",
    description:
      "Minecraft Forge is a free, open-source server that allows players to install and run Minecraft mods.",
    icon: forge,
  },
];

const choosenType = computed(() =>
  types.find((type) => type.value === form.value.type)
);
</script>
