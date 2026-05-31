<template>
  <div class="space-y-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <button
        v-for="type in types"
        :key="type.value"
        type="button"
        :disabled="type.disabled"
        class="text-left rounded-lg ring-1 ring-default p-4 flex gap-3 items-start transition-all"
        :class="{
          'ring-2 ring-primary': form.type === type.value,
          'hover:ring-primary cursor-pointer': !type.disabled,
          'opacity-50 cursor-not-allowed': type.disabled,
        }"
        @click="!type.disabled && (form.type = type.value)"
      >
        <img :src="type.icon" :alt="type.name" class="size-12 shrink-0" />
        <div>
          <p class="font-semibold">{{ type.name }}</p>
          <p class="text-sm text-muted">{{ type.description }}</p>
        </div>
      </button>
    </div>

    <div v-if="choosenType?.customFields?.length" class="space-y-3">
      <h3 class="text-md font-bold">
        Settings for <span class="text-primary">{{ choosenType?.name }}</span>
      </h3>

      <UFormField
        v-for="field in choosenType?.customFields"
        :key="field.name"
        :name="field.name"
        :label="field.label"
        :required="field.required"
      >
        <USelectMenu
          v-if="field.type === 'version'"
          v-model="form.VERSION"
          :items="versionOptions"
          class="w-full"
        />
        <UInput
          v-else
          v-model="form[field.name]"
          :type="field.type"
          class="w-full"
        />
      </UFormField>
    </div>
  </div>
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
    description: "CurseForge modpack server. Set the API key once in Admin → Secrets.",
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
