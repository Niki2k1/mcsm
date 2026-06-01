<template>
  <div class="space-y-6">
    <!-- Loading -->
    <UCard v-if="!status">
      <div class="py-10 text-center text-sm text-muted">
        <UIcon
          name="i-heroicons-arrow-path-20-solid"
          class="size-6 mx-auto animate-spin opacity-60"
        />
      </div>
    </UCard>

    <!-- Unsupported server type -->
    <UCard v-else-if="!status.supported">
      <div class="text-sm text-muted py-10 text-center space-y-2">
        <UIcon name="i-heroicons-map" class="size-8 mx-auto opacity-60" />
        <p class="font-medium text-highlighted">
          BlueMap isn't available for this server type
        </p>
        <p class="max-w-md mx-auto">
          The 3D web map uses the BlueMap plugin, which needs a server that can
          load plugins or mods — Paper, Fabric or Forge. Modpack servers (FTB,
          CurseForge) manage their own mod list.
        </p>
      </div>
    </UCard>

    <!-- Supported, but not enabled -->
    <UCard v-else-if="!status.enabled">
      <div class="text-sm py-10 text-center space-y-4">
        <UIcon
          name="i-heroicons-map"
          class="size-8 mx-auto text-muted opacity-60"
        />
        <div class="space-y-2">
          <p class="font-medium text-highlighted">BlueMap 3D web map</p>
          <p class="max-w-md mx-auto text-muted">
            Explore your world in the browser — a fully interactive 3D map,
            rendered live as the world changes. Powered by
            <ULink
              to="https://bluemap.bluecolored.de/"
              target="_blank"
              class="underline"
              >BlueMap</ULink
            >, installed automatically and served right here through MCSM.
          </p>
        </div>
        <UAlert
          icon="i-heroicons-information-circle"
          color="info"
          variant="soft"
          class="max-w-md mx-auto text-left"
          title="The server restarts once"
          description="Enabling BlueMap adds it to the server's mods and recreates the container. The world is not affected."
        />
        <UButton
          icon="i-heroicons-map-20-solid"
          size="lg"
          :loading="enabling"
          @click="enable"
        >
          Enable BlueMap
        </UButton>
      </div>
    </UCard>

    <!-- Enabled -->
    <UCard
      v-else
      :ui="status.ready ? { body: 'p-0 sm:p-0' } : undefined"
    >
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">World map</h3>
            <p class="text-sm text-muted">
              Interactive 3D map, rendered live by BlueMap.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              v-if="status.ready && status.mapPath"
              :href="status.mapPath"
              target="_blank"
              external
              icon="i-heroicons-arrow-top-right-on-square-20-solid"
              variant="soft"
              color="neutral"
              size="sm"
            >
              Open full screen
            </UButton>
            <UButton
              icon="i-heroicons-x-mark-20-solid"
              variant="ghost"
              color="error"
              size="sm"
              :loading="disabling"
              @click="disableOpen = true"
            >
              Disable
            </UButton>
          </div>
        </div>
      </template>

      <!-- Server offline -->
      <UAlert
        v-if="!server?.running"
        icon="i-heroicons-exclamation-triangle"
        color="warning"
        variant="soft"
        title="Server is not running"
        description="Start the server to view the map."
      />

      <!-- Setup needed: BlueMap installed but Mojang download not accepted -->
      <div v-else-if="!status.ready" class="space-y-4">
        <UAlert
          icon="i-heroicons-arrow-down-circle"
          color="info"
          variant="soft"
          title="One step left"
          description="BlueMap needs to download some assets (block textures and models) from Mojang before it can render the world. This is a one-time download that Mojang requires explicit consent for."
        />
        <div class="flex items-center gap-3">
          <UButton
            icon="i-heroicons-check-20-solid"
            color="success"
            :loading="accepting"
            @click="accept"
          >
            Accept &amp; finish setup
          </UButton>
          <p class="text-xs text-muted">
            Updates BlueMap's config and reloads it — no restart needed.
          </p>
        </div>
        <p v-if="setupHint" class="text-sm text-warning">{{ setupHint }}</p>
      </div>

      <!-- Ready: the embedded map -->
      <iframe
        v-else-if="status.mapPath"
        :src="status.mapPath"
        class="block w-full h-[70vh] border-0 rounded-b-lg bg-black"
        title="BlueMap"
        loading="lazy"
      />
    </UCard>

    <!-- Disable confirmation -->
    <UModal
      v-model:open="disableOpen"
      title="Disable BlueMap"
      description="The map stops being served and the BlueMap plugin is removed on the next container start. Rendered map data stays in the world volume, so re-enabling later picks up where it left off."
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="disabling"
            @click="disableOpen = false"
          >
            Keep BlueMap
          </UButton>
          <UButton color="error" :loading="disabling" @click="disable">
            Disable BlueMap
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from "~/utils/errors";

type BluemapStatus = {
  supported: boolean;
  enabled: boolean;
  running: boolean;
  ready: boolean;
  mapPath: string | null;
};

const { id, server, refresh: refreshServer } = useServerDetail();
const toast = useToast();

const { data: status, refresh } = useFetch<BluemapStatus>(
  () => `/api/server/${id.value}/bluemap/status`,
  { retry: false }
);

// Poll while waiting for BlueMap to come up (installing / just accepted).
// Once the map is ready (or the feature is off), there's nothing to poll for.
let interval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  interval = setInterval(() => {
    if (status.value?.enabled && !status.value.ready) refresh();
  }, 10_000);
});
onUnmounted(() => {
  if (interval) clearInterval(interval);
});

// --- Actions --------------------------------------------------------------------

const enabling = ref(false);
const disabling = ref(false);
const accepting = ref(false);
const disableOpen = ref(false);
const setupHint = ref("");

async function enable() {
  enabling.value = true;
  try {
    const result = await $fetch<{ id: string }>(
      `/api/server/${id.value}/bluemap/enable`,
      { method: "POST" }
    );
    toast.add({
      title: "BlueMap enabled",
      description: "The server is restarting and downloading BlueMap.",
      color: "success",
    });
    // Enabling recreates the container under a new id — navigate to it.
    await navigateTo(`/server/${result.id}/map`);
    await refreshNuxtData("servers");
  } catch (error) {
    toast.add({
      title: "Could not enable BlueMap",
      description: errorMessage(error, "Enabling BlueMap failed."),
      color: "error",
    });
  } finally {
    enabling.value = false;
  }
}

async function disable() {
  disabling.value = true;
  try {
    const result = await $fetch<{ id: string }>(
      `/api/server/${id.value}/bluemap/disable`,
      { method: "POST" }
    );
    toast.add({ title: "BlueMap disabled", color: "success" });
    disableOpen.value = false;
    await navigateTo(`/server/${result.id}/map`);
    await refreshNuxtData("servers");
  } catch (error) {
    toast.add({
      title: "Could not disable BlueMap",
      description: errorMessage(error, "Disabling BlueMap failed."),
      color: "error",
    });
  } finally {
    disabling.value = false;
  }
}

async function accept() {
  accepting.value = true;
  setupHint.value = "";
  try {
    const { result, reloaded } = await $fetch<{
      result: "patched" | "already-accepted" | "missing";
      reloaded: boolean;
    }>(`/api/server/${id.value}/bluemap/accept`, { method: "POST" });

    if (result === "missing") {
      setupHint.value =
        "BlueMap is still installing — give the server a minute to finish booting, then try again.";
      return;
    }

    if (result === "patched" && !reloaded) {
      setupHint.value =
        "Configuration updated, but BlueMap could not be reloaded automatically — restart the server to apply it.";
    } else {
      toast.add({
        title: "Setup complete",
        description:
          "BlueMap is downloading Mojang's assets and starting to render — the map appears here shortly.",
        color: "success",
      });
    }

    // The webserver takes a moment to come up after the reload.
    await refresh();
  } catch (error) {
    toast.add({
      title: "Setup failed",
      description: errorMessage(error, "Could not finish the BlueMap setup."),
      color: "error",
    });
  } finally {
    accepting.value = false;
  }
}

// Reset transient state when navigating to a different (recreated) container.
watch(id, () => {
  setupHint.value = "";
});

// Keep the parent's server data in sync when our status disagrees (e.g. the
// server was started from another tab).
watch(
  () => status.value?.running,
  (running) => {
    if (running !== undefined && running !== server.value?.running) {
      refreshServer();
    }
  }
);
</script>
