<template>
  <UCard v-if="!supported">
    <div class="text-sm text-muted py-10 text-center space-y-2">
      <UIcon name="i-heroicons-folder" class="size-8 mx-auto opacity-60" />
      <p class="font-medium text-highlighted">
        {{
          server?.config?.type === "FTBA"
            ? "FTB modpacks manage their own files"
            : "File editing isn't available for this server type"
        }}
      </p>
      <p class="max-w-md mx-auto">
        {{
          server?.config?.type === "FTBA"
            ? "The Feed The Beast installer re-syncs the server files on every start, so manual edits would be overwritten."
            : "The file manager covers plugin and mod setups. Use a Paper, Fabric, Forge, NeoForge or CurseForge modpack server to edit their files here."
        }}
      </p>
    </div>
  </UCard>

  <ServerDetailFileManager v-else />
</template>

<script setup lang="ts">
const { server } = useServerDetail();

// Mirrors serverTypeSupportsJars() on the server; the file API rejects the rest.
const SUPPORTED = ["PAPER", "FABRIC", "FORGE", "NEOFORGE", "AUTO_CURSEFORGE"];
const supported = computed(() =>
  SUPPORTED.includes(server.value?.config?.type ?? "")
);
</script>
