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
          load plugins or mods — Paper, Fabric, Forge or a CurseForge modpack.
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
            <!-- Publish toggle: published maps are viewable without login. -->
            <USwitch
              :model-value="status.published"
              :disabled="publishing"
              :label="status.published ? 'Public' : 'Private'"
              size="sm"
              @update:model-value="setPublished"
            />
            <UButton
              v-if="status.ready && server?.running"
              icon="i-heroicons-arrow-path-20-solid"
              variant="soft"
              color="neutral"
              size="sm"
              :loading="updatingMap"
              @click="updateMap"
            >
              Update map
            </UButton>
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

      <!-- Ready: render queue progress (when active) + the embedded map -->
      <template v-else-if="status.mapPath">
        <div
          v-if="renderStatus && !renderStatus.idle"
          class="space-y-3 border-b border-default p-4"
        >
          <div
            v-for="map in renderStatus.updating"
            :key="map.map"
            class="space-y-1.5"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span class="font-medium">
                Rendering map “{{ map.map }}”
              </span>
              <span class="font-mono text-xs text-muted">
                <template v-if="map.percent != null"
                  >{{ map.percent.toFixed(1) }}%</template
                >
                <template v-if="map.remaining">
                  · {{ map.remaining }} left</template
                >
                <template v-if="map.region">
                  · region {{ map.region.x }}, {{ map.region.z }}</template
                >
              </span>
            </div>
            <UProgress :model-value="map.percent ?? 0" :max="100" size="sm" />
          </div>
          <p v-if="renderStatus.pendingMaps > 0" class="text-xs text-muted">
            {{ renderStatus.pendingMaps }}
            {{ renderStatus.pendingMaps === 1 ? "map is" : "maps are" }}
            queued for rendering. The map below updates live as tiles finish.
          </p>
        </div>

        <iframe
          :src="status.mapPath"
          class="block w-full h-[70vh] border-0 rounded-b-lg bg-black"
          title="BlueMap"
          loading="lazy"
        />
      </template>
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
  published: boolean;
  mapPath: string | null;
};

const { id, server, refresh: refreshServer } = useServerDetail();
const toast = useToast();

const { data: status, refresh } = useFetch<BluemapStatus>(
  () => `/api/server/${id.value}/bluemap/status`,
  { retry: false }
);

// Poll while waiting for BlueMap to come up (installing / just accepted), and
// keep the render-queue status fresh while the map is usable.
let interval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  refreshRenderStatus();
  interval = setInterval(() => {
    if (status.value?.enabled && !status.value.ready) refresh();
    refreshRenderStatus();
  }, 10_000);
});
onUnmounted(() => {
  if (interval) clearInterval(interval);
});

// --- BlueMap render queue --------------------------------------------------------

type RenderStatus = {
  renderThreads: number | null;
  updating: {
    map: string;
    percent: number | null;
    remaining: string | null;
    region: { x: number; z: number } | null;
  }[];
  pendingMaps: number;
  idle: boolean;
  raw: string;
};

const renderStatus = ref<RenderStatus | null>(null);
const updatingMap = ref(false);

/** Refresh the render queue reading — only meaningful while the map serves. */
async function refreshRenderStatus() {
  if (!status.value?.enabled || !status.value.ready || !server.value?.running) {
    renderStatus.value = null;
    return;
  }
  try {
    renderStatus.value = await $fetch<RenderStatus>(
      `/api/server/${id.value}/bluemap/render-status`
    );
  } catch {
    // Server stopped or RCON unavailable — nothing to show.
    renderStatus.value = null;
  }
}

// The map just became ready (e.g. after accepting the asset download) — get an
// initial render-queue reading right away instead of waiting for the next poll.
watch(
  () => status.value?.ready,
  (ready) => {
    if (ready) refreshRenderStatus();
  }
);

/** Save the world and have BlueMap re-render everything that changed. */
async function updateMap() {
  updatingMap.value = true;
  try {
    renderStatus.value = await $fetch<RenderStatus>(
      `/api/server/${id.value}/bluemap/update`,
      { method: "POST" }
    );
    toast.add({
      title: "Map update started",
      description:
        "The world was saved and BlueMap is re-rendering changed areas — progress shows above the map.",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Could not update the map",
      description: errorMessage(
        error,
        "Triggering the BlueMap update failed."
      ),
      color: "error",
    });
  } finally {
    updatingMap.value = false;
  }
}

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

// Publish / unpublish: published maps can be viewed without logging in,
// e.g. by players you share the link with.
const publishing = ref(false);

async function setPublished(value: boolean) {
  publishing.value = true;
  try {
    await $fetch(`/api/server/${id.value}/bluemap/publish`, {
      method: "POST",
      body: { public: value },
    });
    await refresh();
    toast.add({
      title: value ? "Map published" : "Map unpublished",
      description: value
        ? "Anyone with the link can now view this map — no login needed."
        : "The map now requires a login again.",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Could not update map visibility",
      description: errorMessage(error, "Updating the map visibility failed."),
      color: "error",
    });
  } finally {
    publishing.value = false;
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
