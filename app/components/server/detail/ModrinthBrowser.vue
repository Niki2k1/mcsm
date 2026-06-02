<template>
  <USlideover
    v-model:open="open"
    title="Browse Modrinth"
    :description="`Search for ${kindLabel.toLowerCase()} compatible with this server.`"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Search controls -->
        <div class="flex items-center gap-2">
          <UInput
            v-model="query"
            icon="i-heroicons-magnifying-glass-20-solid"
            :placeholder="`Search ${kindLabel.toLowerCase()}...`"
            class="flex-1"
            autofocus
          />
          <!-- CurseForge modpacks: loader can't be derived from the type -->
          <USelect
            v-if="isModpackServer"
            v-model="loaderOverride"
            :items="loaderOptions"
            class="w-32"
          />
        </div>

        <!-- Compatibility hint -->
        <p v-if="searchMeta" class="text-xs text-muted">
          Showing builds for
          <span class="font-mono">{{ searchMeta.loader }}</span> ·
          <span class="font-mono">{{ searchMeta.gameVersion }}</span>
          — {{ searchMeta.total.toLocaleString() }} results
        </p>

        <!-- Results -->
        <div v-if="results.length" class="flex flex-col gap-2">
          <div
            v-for="hit in results"
            :key="hit.project_id"
            class="flex items-center gap-3 rounded-lg ring-2 ring-transparent hover:ring-primary/50 transition-all duration-150 px-3 py-2.5 bg-elevated/50"
          >
            <img
              v-if="hit.icon_url"
              :src="hit.icon_url"
              alt=""
              class="size-10 shrink-0 rounded-md bg-muted object-cover"
              loading="lazy"
            />
            <div
              v-else
              class="size-10 shrink-0 rounded-md bg-muted flex items-center justify-center"
            >
              <UIcon
                name="i-heroicons-puzzle-piece-20-solid"
                class="size-5 text-muted"
              />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold truncate">{{ hit.title }}</p>
                <span class="text-xs text-muted shrink-0">
                  <UIcon
                    name="i-heroicons-arrow-down-tray-16-solid"
                    class="size-3 inline-block align-middle"
                  />
                  {{ formatDownloads(hit.downloads) }}
                </span>
              </div>
              <p class="text-xs text-muted line-clamp-2">
                {{ hit.description }}
              </p>
            </div>

            <UButton
              v-if="installedProjectIds.has(hit.project_id)"
              size="xs"
              variant="soft"
              color="success"
              icon="i-heroicons-check-20-solid"
              disabled
              class="shrink-0"
            >
              Installed
            </UButton>
            <UButton
              v-else
              size="xs"
              icon="i-heroicons-plus-20-solid"
              :loading="installing === hit.project_id"
              :disabled="installing !== null"
              class="shrink-0"
              @click="install(hit)"
            >
              Install
            </UButton>
          </div>

          <!-- Pagination -->
          <UButton
            v-if="results.length < (searchMeta?.total ?? 0)"
            variant="ghost"
            color="neutral"
            block
            :loading="searching"
            @click="loadMore"
          >
            Load more
          </UButton>
        </div>

        <!-- States -->
        <div
          v-else-if="searching"
          class="py-12 text-center text-muted"
        >
          <UIcon
            name="i-heroicons-arrow-path-20-solid"
            class="size-6 mx-auto animate-spin opacity-60"
          />
        </div>
        <div
          v-else-if="query && searched"
          class="py-12 text-center text-sm text-muted"
        >
          No compatible {{ kindLabel.toLowerCase() }} found for "{{ query }}".
        </div>
        <div v-else class="py-12 text-center text-sm text-muted space-y-2">
          <UIcon
            name="i-heroicons-globe-alt"
            class="size-8 mx-auto opacity-60"
          />
          <p>
            Search Modrinth — results are filtered to builds that work with
            this server's loader and Minecraft version.
          </p>
        </div>

        <!-- Search error -->
        <UAlert
          v-if="searchError"
          icon="i-heroicons-exclamation-triangle"
          color="error"
          variant="soft"
          :description="searchError"
        />
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { errorMessage } from "~/utils/errors";

type SearchHit = {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  categories: string[];
};

const props = defineProps<{
  /** Modrinth project ids already installed on the server. */
  installedProjectIds: Set<string>;
  /** The Files tab's "restart after changes" toggle value. */
  restart: boolean;
  /** "Plugins" or "Mods" — for copy. */
  kindLabel: string;
}>();

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ installed: [] }>();

const { id, server, refresh: refreshServer } = useServerDetail();
const toast = useToast();

// --- Search ----------------------------------------------------------------------

const query = ref("");
const results = ref<SearchHit[]>([]);
const searchMeta = ref<{
  total: number;
  loader: string;
  gameVersion: string;
} | null>(null);
const searching = ref(false);
const searched = ref(false);
const searchError = ref("");
const offset = ref(0);

const isModpackServer = computed(
  () => server.value?.config?.type === "AUTO_CURSEFORGE"
);
const loaderOverride = ref<string | undefined>(undefined);
const loaderOptions = [
  { label: "Auto-detect", value: undefined },
  { label: "Forge", value: "forge" },
  { label: "NeoForge", value: "neoforge" },
  { label: "Fabric", value: "fabric" },
];

async function search(append = false) {
  if (!query.value.trim()) {
    results.value = [];
    searchMeta.value = null;
    searched.value = false;
    return;
  }

  searching.value = true;
  searchError.value = "";
  try {
    const response = await $fetch<{
      hits: SearchHit[];
      total: number;
      loader: string;
      gameVersion: string;
    }>(`/api/server/${id.value}/modrinth/search`, {
      query: {
        query: query.value.trim(),
        offset: append ? offset.value : 0,
        ...(loaderOverride.value ? { loader: loaderOverride.value } : {}),
      },
    });

    results.value = append
      ? [...results.value, ...response.hits]
      : response.hits;
    searchMeta.value = {
      total: response.total,
      loader: response.loader,
      gameVersion: response.gameVersion,
    };
    searched.value = true;
  } catch (error) {
    searchError.value = errorMessage(error, "Search failed.");
    if (!append) results.value = [];
  } finally {
    searching.value = false;
  }
}

function loadMore() {
  offset.value = results.value.length;
  search(true);
}

// Debounced live search while typing; immediate re-search on loader change.
watchDebounced(query, () => search(), { debounce: 300 });
watch(loaderOverride, () => search());

// Reset state each time the slideover opens.
watch(open, (isOpen) => {
  if (isOpen) {
    query.value = "";
    results.value = [];
    searchMeta.value = null;
    searched.value = false;
    searchError.value = "";
  }
});

// --- Install ----------------------------------------------------------------------

const installing = ref<string | null>(null);

async function install(hit: SearchHit) {
  installing.value = hit.project_id;
  try {
    const result = await $fetch<{
      added: { filename: string; version_number: string; dependency: boolean }[];
      restarted: boolean;
    }>(`/api/server/${id.value}/modrinth/install`, {
      method: "POST",
      body: {
        project: hit.project_id,
        restart: props.restart,
        ...(loaderOverride.value ? { loader: loaderOverride.value } : {}),
      },
    });

    const deps = result.added.filter((added) => added.dependency);
    toast.add({
      title: `${hit.title} installed`,
      description:
        (deps.length
          ? `Including ${deps.length} required ${deps.length === 1 ? "dependency" : "dependencies"}. `
          : "") +
        (result.restarted
          ? "The server is restarting to load it."
          : "It loads on the next server start."),
      color: "success",
    });

    emit("installed");
    if (result.restarted) await refreshServer();
  } catch (error) {
    toast.add({
      title: `Could not install ${hit.title}`,
      description: errorMessage(error, "Installation failed."),
      color: "error",
    });
  } finally {
    installing.value = null;
  }
}

// --- Formatting -------------------------------------------------------------------

function formatDownloads(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}
</script>
