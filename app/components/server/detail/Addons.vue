<template>
  <div class="space-y-6">
    <!-- Unsupported server type -->
    <UCard v-if="!supported">
      <div class="text-sm text-muted py-10 text-center space-y-2">
        <UIcon
          name="i-heroicons-puzzle-piece"
          class="size-8 mx-auto opacity-60"
        />
        <p class="font-medium text-highlighted">
          {{
            server?.config?.type === "FTBA"
              ? "FTB modpacks manage their own mods"
              : "This server type can't load mods or plugins"
          }}
        </p>
        <p class="max-w-md mx-auto">
          {{
            server?.config?.type === "FTBA"
              ? "The Feed The Beast installer owns the mods folder and re-syncs it on every start — manually added files would be removed again."
              : "Vanilla servers have no plugin or mod loader. Use a Paper, Fabric, Forge or CurseForge modpack server to install add-ons."
          }}
        </p>
      </div>
    </UCard>

    <template v-else>
      <!-- Jar manager -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="font-semibold">{{ kindLabel }}</h3>
              <p class="text-sm text-muted">
                Upload custom .jar files — they're loaded the next time the
                server starts.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <UButton
                v-if="selectedJars.length"
                icon="i-heroicons-trash-20-solid"
                color="error"
                variant="soft"
                size="sm"
                @click="batchDeleteOpen = true"
              >
                Delete {{ selectedJars.length }}
              </UButton>
              <UInput
                v-model="jarSearch"
                icon="i-heroicons-magnifying-glass-20-solid"
                placeholder="Search..."
                size="sm"
                class="w-40"
              />
              <div class="flex items-center gap-2">
                <USwitch v-model="restartAfter" size="sm" />
                <span class="text-xs text-muted whitespace-nowrap">
                  Restart after changes
                </span>
              </div>
            </div>
          </div>
        </template>

        <div class="space-y-5">
          <!-- Upload drop zone -->
          <UFileUpload
            v-model="uploadFiles"
            accept=".jar,.zip"
            multiple
            variant="area"
            layout="list"
            position="outside"
            :file-image="false"
            file-icon="i-heroicons-puzzle-piece-20-solid"
            icon="i-heroicons-arrow-up-tray-20-solid"
            :label="`Drop ${kindLabel.toLowerCase()} here`"
            description=".jar files or .zip bundles, max 100 MB"
            :disabled="uploading"
            class="min-h-32"
          >
            <template #files-bottom="{ files }">
              <UButton
                v-if="files?.length"
                icon="i-heroicons-arrow-up-tray-20-solid"
                :loading="uploading"
                class="self-start"
                @click="upload"
              >
                Upload {{ files.length }}
                {{ files.length === 1 ? "file" : "files" }}
              </UButton>
            </template>
          </UFileUpload>

          <!-- Jar list -->
          <div v-if="filteredJars.length">
            <div
              class="flex items-center gap-4 px-4 py-3 mb-2 text-xs font-medium text-muted uppercase tracking-wider border-b border-default"
            >
              <UCheckbox
                :model-value="allJarsSelected"
                :indeterminate="
                  selectedJars.length > 0 && !allJarsSelected
                "
                aria-label="Select all"
                @update:model-value="toggleSelectAll"
              />
              <div class="w-5" />
              <div class="flex-1 min-w-0">Filename</div>
              <div class="w-24 text-right">Size</div>
              <div class="w-16 text-right">Actions</div>
            </div>

            <div class="flex flex-col gap-2">
              <div
                v-for="jar in filteredJars"
                :key="jar.name"
                class="flex items-center gap-4 rounded-lg ring-2 ring-transparent hover:ring-primary/50 cursor-pointer transition-all duration-150 px-4 py-2 bg-elevated/50"
                @click="toggleJarSelection(jar.name)"
              >
                <UCheckbox
                  :model-value="selectedJars.includes(jar.name)"
                  :aria-label="`Select ${jar.name}`"
                  @update:model-value="toggleJarSelection(jar.name)"
                  @click.stop
                />
                <UIcon
                  name="i-heroicons-puzzle-piece-20-solid"
                  class="size-5 text-muted shrink-0"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium font-mono truncate">
                    {{ jar.name }}
                  </p>
                </div>
                <div class="w-24 text-right text-sm text-muted">
                  {{ formatSize(jar.size) }}
                </div>
                <div class="w-16 flex justify-end">
                  <UDropdownMenu
                    :items="jarMenuItems(jar)"
                    :ui="{ content: 'w-48' }"
                  >
                    <UButton
                      icon="i-heroicons-ellipsis-vertical-20-solid"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      aria-label="Jar actions"
                      @click.stop
                    />
                  </UDropdownMenu>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else-if="jarsStatus !== 'pending'"
            class="text-sm text-muted py-8 text-center"
          >
            {{
              jarSearch
                ? "No matches."
                : `No ${kindLabel.toLowerCase()} installed yet.`
            }}
          </div>

          <!-- Integration jars hint -->
          <UAlert
            icon="i-heroicons-information-circle"
            color="info"
            variant="soft"
            :description="integrationHint"
          />
        </div>
      </UCard>

      <!-- Config files -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="font-semibold">Configuration files</h3>
              <p class="text-sm text-muted">
                Edit {{ kindLabel.toLowerCase() }} and server config files
                right in the browser.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UInput
                v-model="fileSearch"
                icon="i-heroicons-magnifying-glass-20-solid"
                placeholder="Search..."
                size="sm"
                class="w-40"
              />
              <UButton
                icon="i-heroicons-arrow-path-20-solid"
                variant="ghost"
                color="neutral"
                size="sm"
                aria-label="Refresh files"
                :loading="filesStatus === 'pending'"
                @click="refreshFiles()"
              />
            </div>
          </div>
        </template>

        <div v-if="filteredFiles.length">
          <div
            class="flex items-center gap-4 px-4 py-3 mb-2 text-xs font-medium text-muted uppercase tracking-wider border-b border-default"
          >
            <div class="w-5" />
            <div class="flex-1 min-w-0">File</div>
            <div class="w-24 text-right">Size</div>
            <div class="w-16 text-right">Actions</div>
          </div>

          <div class="flex flex-col gap-2">
            <div
              v-for="file in filteredFiles"
              :key="file.path"
              class="flex items-center gap-4 rounded-lg ring-2 ring-transparent hover:ring-primary/50 cursor-pointer transition-all duration-150 px-4 py-2 bg-elevated/50"
              @click="openEditor(file)"
            >
              <UIcon
                :name="fileIcon(file.path)"
                class="size-5 text-muted shrink-0"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-mono truncate">
                  <span class="text-muted">{{ fileDir(file.path) }}</span
                  ><span class="font-medium">{{ fileName(file.path) }}</span>
                </p>
              </div>
              <div class="w-24 text-right text-sm text-muted">
                {{ formatSize(file.size) }}
              </div>
              <div class="w-16 flex justify-end">
                <UDropdownMenu
                  :items="fileMenuItems(file)"
                  :ui="{ content: 'w-48' }"
                >
                  <UButton
                    icon="i-heroicons-ellipsis-vertical-20-solid"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    aria-label="File actions"
                    @click.stop
                  />
                </UDropdownMenu>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else-if="filesStatus !== 'pending'"
          class="text-sm text-muted py-8 text-center"
        >
          {{
            fileSearch
              ? "No matches."
              : "No config files yet — most appear after the server's first start."
          }}
        </div>
        <div v-else class="text-sm text-muted py-8 text-center">
          <UIcon
            name="i-heroicons-arrow-path-20-solid"
            class="size-5 mx-auto animate-spin opacity-60"
          />
        </div>
      </UCard>
    </template>

    <!-- Editor modal -->
    <UModal
      v-model:open="editorOpen"
      :title="editingFile?.path ?? ''"
      description="Changes apply after the server restarts."
      :ui="{ content: 'max-w-4xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <UAlert
            v-if="editorError"
            icon="i-heroicons-exclamation-triangle"
            color="error"
            variant="soft"
            :description="editorError"
          />
          <div
            v-if="editorLoading"
            class="h-[55vh] flex items-center justify-center text-muted"
          >
            <UIcon
              name="i-heroicons-arrow-path-20-solid"
              class="size-6 animate-spin"
            />
          </div>
          <CodeEditor
            v-else
            v-model="draft"
            :language="editorLanguage"
            :theme="editorTheme"
            class="h-[55vh] rounded-md overflow-hidden ring-1 ring-default"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex items-center justify-between gap-2 w-full">
          <div class="flex items-center gap-2">
            <USwitch v-model="restartAfter" size="sm" />
            <span class="text-xs text-muted">Restart server after saving</span>
          </div>
          <div class="flex gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="saving"
              @click="editorOpen = false"
            >
              Cancel
            </UButton>
            <UButton :loading="saving" :disabled="editorLoading" @click="save">
              Save
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Single jar delete confirmation -->
    <UModal
      v-model:open="deleteOpen"
      title="Delete jar"
      :description="`Delete ${pendingDelete}? ${restartAfter && server?.running ? 'The server restarts afterwards.' : 'The change applies on the next restart.'}`"
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="deleting"
            @click="deleteOpen = false"
          >
            Cancel
          </UButton>
          <UButton color="error" :loading="deleting" @click="runDelete">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Batch delete confirmation -->
    <UModal
      v-model:open="batchDeleteOpen"
      title="Delete selected jars"
      :description="`Delete ${selectedJars.length} ${selectedJars.length === 1 ? 'jar' : 'jars'}? ${restartAfter && server?.running ? 'The server restarts once afterwards.' : 'The change applies on the next restart.'}`"
    >
      <template #body>
        <ul class="text-sm font-mono text-muted space-y-1">
          <li v-for="name in selectedJars" :key="name">{{ name }}</li>
        </ul>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="deleting"
            @click="batchDeleteOpen = false"
          >
            Cancel
          </UButton>
          <UButton color="error" :loading="deleting" @click="runBatchDelete">
            Delete {{ selectedJars.length }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import { errorMessage } from "~/utils/errors";

type JarInfo = { name: string; size: number };
type ConfigFile = { path: string; size: number };

const { id, server, refresh: refreshServer } = useServerDetail();
const toast = useToast();
const colorMode = useColorMode();

// --- Type gating ----------------------------------------------------------------

const SUPPORTED = ["PAPER", "FABRIC", "FORGE", "AUTO_CURSEFORGE"];
const supported = computed(() =>
  SUPPORTED.includes(server.value?.config?.type ?? "")
);
const kindLabel = computed(() =>
  server.value?.config?.type === "PAPER" ? "Plugins" : "Mods"
);

const integrationHint = computed(() => {
  const base =
    "Jars installed by integrations (BlueMap, Chunky) are managed through MODRINTH_PROJECTS and re-download on the next start if deleted here.";
  return server.value?.config?.type === "AUTO_CURSEFORGE"
    ? `${base} Mods that belong to the CurseForge modpack also re-sync on the next start.`
    : base;
});

// --- Data -----------------------------------------------------------------------

const {
  data: jars,
  refresh: refreshJars,
  status: jarsStatus,
} = useFetch<JarInfo[]>(() => `/api/server/${id.value}/jars`, {
  default: () => [],
  retry: false,
  immediate: true,
});

const {
  data: files,
  refresh: refreshFiles,
  status: filesStatus,
} = useFetch<ConfigFile[]>(() => `/api/server/${id.value}/files`, {
  default: () => [],
  retry: false,
  immediate: true,
});

const jarSearch = ref("");
const fileSearch = ref("");

const filteredJars = computed(() =>
  (jars.value ?? []).filter((jar) =>
    jar.name.toLowerCase().includes(jarSearch.value.toLowerCase())
  )
);
const filteredFiles = computed(() =>
  (files.value ?? []).filter((file) =>
    file.path.toLowerCase().includes(fileSearch.value.toLowerCase())
  )
);

// --- Selection -------------------------------------------------------------------

const selectedJars = ref<string[]>([]);

const allJarsSelected = computed(
  () =>
    filteredJars.value.length > 0 &&
    selectedJars.value.length === filteredJars.value.length
);

function toggleJarSelection(name: string) {
  selectedJars.value = selectedJars.value.includes(name)
    ? selectedJars.value.filter((selected) => selected !== name)
    : [...selectedJars.value, name];
}

function toggleSelectAll() {
  selectedJars.value = allJarsSelected.value
    ? []
    : filteredJars.value.map((jar) => jar.name);
}

// --- Upload ----------------------------------------------------------------------

const uploadFiles = ref<File[]>([]);
const uploading = ref(false);
const restartAfter = ref(true);

async function upload() {
  if (!uploadFiles.value.length) return;
  uploading.value = true;
  try {
    const body = new FormData();
    for (const file of uploadFiles.value) body.append("files", file);

    const result = await $fetch<{ added: string[]; restarted: boolean }>(
      `/api/server/${id.value}/jars`,
      {
        method: "POST",
        query: { restart: String(restartAfter.value) },
        body,
      }
    );

    toast.add({
      title: `${result.added.length} ${result.added.length === 1 ? "jar" : "jars"} uploaded`,
      description: result.restarted
        ? "The server is restarting to load them."
        : "They load on the next server start.",
      color: "success",
    });
    uploadFiles.value = [];
    await refreshJars();
    if (result.restarted) await refreshServer();
  } catch (error) {
    toast.add({
      title: "Upload failed",
      description: errorMessage(error, "Could not upload the files."),
      color: "error",
    });
  } finally {
    uploading.value = false;
  }
}

// --- Delete ----------------------------------------------------------------------

const deleteOpen = ref(false);
const batchDeleteOpen = ref(false);
const deleting = ref(false);
const pendingDelete = ref("");

function jarMenuItems(jar: JarInfo): DropdownMenuItem[] {
  return [
    {
      label: "Download",
      icon: "i-heroicons-arrow-down-tray-20-solid",
      onSelect: () => {
        window.open(
          `/api/server/${id.value}/jars/${encodeURIComponent(jar.name)}`,
          "_blank"
        );
      },
    },
    {
      label: "Delete",
      icon: "i-heroicons-trash-20-solid",
      color: "error",
      onSelect: () => {
        pendingDelete.value = jar.name;
        deleteOpen.value = true;
      },
    },
  ];
}

async function deleteOne(name: string, restart: boolean) {
  await $fetch(
    `/api/server/${id.value}/jars/${encodeURIComponent(name)}`,
    { method: "DELETE", query: { restart: String(restart) } }
  );
}

async function runDelete() {
  if (!pendingDelete.value) return;
  deleting.value = true;
  try {
    await deleteOne(pendingDelete.value, restartAfter.value);
    toast.add({ title: `${pendingDelete.value} deleted`, color: "success" });
    deleteOpen.value = false;
    selectedJars.value = selectedJars.value.filter(
      (name) => name !== pendingDelete.value
    );
    await refreshJars();
  } catch (error) {
    toast.add({
      title: "Delete failed",
      description: errorMessage(error, "Could not delete the jar."),
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
}

async function runBatchDelete() {
  if (!selectedJars.value.length) return;
  deleting.value = true;
  try {
    // Delete without restarting, then restart once at the end if requested.
    for (const name of selectedJars.value) {
      await deleteOne(name, false);
    }
    if (restartAfter.value && server.value?.running) {
      await $fetch(`/api/server/${id.value}/restart`, { method: "POST" });
    }
    toast.add({
      title: `${selectedJars.value.length} jars deleted`,
      color: "success",
    });
    batchDeleteOpen.value = false;
    selectedJars.value = [];
    await refreshJars();
  } catch (error) {
    toast.add({
      title: "Delete failed",
      description: errorMessage(error, "Could not delete all jars."),
      color: "error",
    });
    await refreshJars();
  } finally {
    deleting.value = false;
  }
}

// --- Config editor ----------------------------------------------------------------

const editorOpen = ref(false);
const editorLoading = ref(false);
const editingFile = ref<ConfigFile | null>(null);
const draft = ref("");
const editorError = ref("");
const saving = ref(false);

const editorTheme = computed(() =>
  colorMode.value === "dark" ? "vitesse-dark" : "vitesse-light"
);

const editorLanguage = computed(() => {
  const path = editingFile.value?.path.toLowerCase() ?? "";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".toml")) return "toml";
  if (path.endsWith(".properties") || path.endsWith(".ini")) return "ini";
  return "plaintext";
});

function fileMenuItems(file: ConfigFile): DropdownMenuItem[] {
  return [
    {
      label: "Edit",
      icon: "i-heroicons-pencil-square-20-solid",
      onSelect: () => openEditor(file),
    },
    {
      label: "Download",
      icon: "i-heroicons-arrow-down-tray-20-solid",
      onSelect: () => {
        window.open(
          `/api/server/${id.value}/files/content?path=${encodeURIComponent(file.path)}&download=true`,
          "_blank"
        );
      },
    },
  ];
}

async function openEditor(file: ConfigFile) {
  editingFile.value = file;
  editorError.value = "";
  draft.value = "";
  editorOpen.value = true;
  editorLoading.value = true;
  try {
    const result = await $fetch<{ path: string; content: string }>(
      `/api/server/${id.value}/files/content`,
      { query: { path: file.path } }
    );
    draft.value = result.content;
  } catch (error) {
    editorError.value = errorMessage(error, "Could not read the file.");
  } finally {
    editorLoading.value = false;
  }
}

async function save() {
  if (!editingFile.value) return;
  saving.value = true;
  editorError.value = "";
  try {
    const result = await $fetch<{ ok: boolean; restarted: boolean }>(
      `/api/server/${id.value}/files/content`,
      {
        method: "PUT",
        body: {
          path: editingFile.value.path,
          content: draft.value,
          restart: restartAfter.value,
        },
      }
    );
    toast.add({
      title: "File saved",
      description: result.restarted
        ? "The server is restarting to apply it."
        : "The change applies on the next server start.",
      color: "success",
    });
    editorOpen.value = false;
    await refreshFiles();
  } catch (error) {
    // Validation errors (invalid YAML/JSON) stay inside the modal.
    editorError.value = errorMessage(error, "Could not save the file.");
  } finally {
    saving.value = false;
  }
}

// --- Display helpers ----------------------------------------------------------------

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KiB`;
  return `${(kib / 1024).toFixed(2)} MiB`;
}

function fileDir(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index + 1);
}

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

function fileIcon(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "i-heroicons-code-bracket-20-solid";
  if (lower.endsWith(".toml") || lower.endsWith(".properties"))
    return "i-heroicons-adjustments-horizontal-20-solid";
  return "i-heroicons-document-text-20-solid";
}

// --- Container identity changes (config edits recreate the container) ---------------

watch(id, () => {
  selectedJars.value = [];
  uploadFiles.value = [];
  editorOpen.value = false;
  editingFile.value = null;
  refreshJars();
  refreshFiles();
});
</script>
