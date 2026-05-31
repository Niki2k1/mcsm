<template>
  <div class="space-y-4">
    <!-- Summary header -->
    <UCard :ui="{ body: 'p-4 sm:p-4' }">
      <div class="flex items-center gap-4">
        <img
          v-if="typeMeta?.icon"
          :src="typeMeta.icon"
          :alt="typeMeta.name"
          class="size-12 shrink-0"
        />
        <div class="min-w-0">
          <h3 class="text-lg font-bold truncate">
            {{ form.name || "Unnamed Server" }}
          </h3>
          <p class="text-sm text-muted truncate">
            {{ fullAddress || "No address configured" }}
          </p>
        </div>
        <UBadge
          v-if="typeMeta"
          class="ml-auto shrink-0"
          color="primary"
          variant="subtle"
        >
          {{ typeMeta.name }}
        </UBadge>
      </div>
    </UCard>

    <!-- Server -->
    <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-4' }">
      <template #header><h4 class="font-semibold">Server</h4></template>
      <dl class="divide-y divide-default">
        <ReviewRow label="Type">{{ typeMeta?.name ?? "—" }}</ReviewRow>
        <ReviewRow v-if="versionLabel" label="Version">
          {{ versionLabel }}
        </ReviewRow>
        <ReviewRow label="Memory">{{ form.memory ?? "—" }}</ReviewRow>
        <ReviewRow v-if="form.FTB_MODPACK_ID" label="Modpack ID">
          {{ form.FTB_MODPACK_ID }}
        </ReviewRow>
        <ReviewRow v-if="form.FTB_MODPACK_VERSION_ID" label="Modpack Version ID">
          {{ form.FTB_MODPACK_VERSION_ID }}
        </ReviewRow>
        <ReviewRow v-if="form.CF_SLUG" label="CurseForge Slug">
          {{ form.CF_SLUG }}
        </ReviewRow>
        <ReviewRow v-if="form.CF_API_KEY" label="CurseForge API Key">
          {{ maskedApiKey }}
        </ReviewRow>
        <ReviewRow v-if="form.CF_FILE_ID" label="CurseForge File ID">
          {{ form.CF_FILE_ID }}
        </ReviewRow>
      </dl>
    </UCard>

    <!-- Connection -->
    <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-4' }">
      <template #header><h4 class="font-semibold">Connection</h4></template>
      <dl class="divide-y divide-default">
        <ReviewRow label="Address">
          <span class="font-mono">{{ fullAddress || "—" }}</span>
        </ReviewRow>
      </dl>
    </UCard>

    <!-- World & Gameplay -->
    <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-4' }">
      <template #header>
        <h4 class="font-semibold">World &amp; Gameplay</h4>
      </template>
      <dl class="divide-y divide-default">
        <ReviewRow label="MOTD">
          <Motd v-if="form.MOTD" :motd="form.MOTD" />
          <span v-else class="text-muted">—</span>
        </ReviewRow>
        <ReviewRow label="World Name">{{ form.LEVEL || "world" }}</ReviewRow>
        <ReviewRow label="Difficulty">
          <span class="capitalize">{{ form.DIFFICULTY }}</span>
        </ReviewRow>
        <ReviewRow label="Max Players">{{ form.MAX_PLAYERS }}</ReviewRow>
        <ReviewRow label="Hardcore"><BoolBadge :value="form.HARDCORE" /></ReviewRow>
        <ReviewRow label="Online Mode">
          <BoolBadge :value="form.ONLINE_MODE" />
        </ReviewRow>
        <ReviewRow label="Allow Flight">
          <BoolBadge :value="form.ALLOW_FLIGHT" />
        </ReviewRow>
      </dl>
    </UCard>

    <!-- Players -->
    <UCard :ui="{ body: 'p-0 sm:p-0', header: 'px-4 py-3 sm:px-4' }">
      <template #header><h4 class="font-semibold">Players</h4></template>
      <dl class="divide-y divide-default">
        <ReviewRow label="Operators">
          <PlayerPills :players="form.operators" />
        </ReviewRow>
        <ReviewRow label="Whitelist">
          <PlayerPills :players="form.whitelist" />
        </ReviewRow>
      </dl>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import vanilla from "~/assets/vanilla.webp";
import ftb from "~/assets/ftb.svg";
import curseforge from "~/assets/curseforge.svg";
import modrinth from "~/assets/modrinth.svg";
import paper from "~/assets/paper.svg";
import fabric from "~/assets/fabric.png";
import forge from "~/assets/forge.svg";

const form = useCreateForm();

const typeMeta = computed(() => {
  const types: Record<string, { name: string; icon: string }> = {
    VANILLA: { name: "Vanilla", icon: vanilla },
    FTBA: { name: "Feed The Beast", icon: ftb },
    AUTO_CURSEFORGE: { name: "CurseForge", icon: curseforge },
    MODRINTH: { name: "Modrinth", icon: modrinth },
    PAPER: { name: "Paper", icon: paper },
    FABRIC: { name: "Fabric", icon: fabric },
    FORGE: { name: "Forge", icon: forge },
  };

  return form.value.type ? types[form.value.type] : null;
});

const fullAddress = computed(() => {
  const subdomain =
    form.value.subdomain ||
    (form.value.name ?? "").toLocaleLowerCase().replaceAll(" ", "-");

  if (!subdomain || !form.value.domain) return "";

  return `${subdomain}.${form.value.domain}`;
});

const versionLabel = computed(() => {
  const version = form.value.VERSION as unknown;

  if (!version) return null;
  if (typeof version === "string") return version;
  if (typeof version === "object" && version && "label" in version) {
    return (version as { label: string }).label;
  }

  return null;
});

const maskedApiKey = computed(() => {
  const key = form.value.CF_API_KEY ?? "";
  if (key.length <= 4) return "••••";
  return `${"•".repeat(Math.max(key.length - 4, 4))}${key.slice(-4)}`;
});
</script>
