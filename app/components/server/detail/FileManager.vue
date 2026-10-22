<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="font-semibold">Files</h3>
          <p class="text-sm text-muted">
            Config files, datapacks and plugin data like WorldEdit schematics.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass-20-solid"
            placeholder="Search all files..."
            size="sm"
            class="w-48"
          />
          <UButton
            icon="i-heroicons-arrow-up-tray-20-solid"
            size="sm"
            variant="soft"
            :disabled="!currentDir"
            @click="openUpload()"
          >
            Upload
          </UButton>
          <UDropdownMenu :items="newMenuItems">
            <UButton
              icon="i-heroicons-plus-20-solid"
              size="sm"
              variant="soft"
              color="neutral"
            >
              New
            </UButton>
          </UDropdownMenu>
          <UButton
            icon="i-heroicons-arrow-path-20-solid"
            variant="ghost"
            color="neutral"
            size="sm"
            aria-label="Refresh files"
            :loading="status === 'pending'"
            @click="refresh()"
          />
        </div>
      </div>
    </template>

    <div
      class="space-y-3 rounded-lg transition-colors"
      :class="{ 'ring-2 ring-primary bg-primary/5': dragging }"
      @dragover.prevent="onDragOver"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="flex items-center justify-between gap-3 min-h-8">
        <UBreadcrumb v-if="!search" :items="breadcrumb" />
        <p v-else class="text-sm text-muted">
          {{ visible.length }}
          {{ visible.length === 1 ? "match" : "matches" }} for "{{ search }}"
        </p>
        <p v-if="currentDir && !search" class="text-xs text-dimmed">
          Drop files here to upload
        </p>
      </div>

      <UAlert
        v-if="listing?.truncated"
        icon="i-heroicons-exclamation-triangle"
        color="warning"
        variant="soft"
        description="This server has too many files to list them all — some are missing below."
      />

      <div v-if="visible.length">
        <div
          class="flex items-center gap-4 px-4 py-3 mb-2 text-xs font-medium text-muted uppercase tracking-wider border-b border-default"
        >
          <div class="w-5" />
          <div class="flex-1 min-w-0">Name</div>
          <div class="w-24 text-right">Size</div>
          <div class="w-16 text-right">Actions</div>
        </div>

        <div class="flex flex-col gap-2">
          <div
            v-for="entry in visible"
            :key="entry.path"
            class="flex items-center gap-4 rounded-lg ring-2 ring-transparent hover:ring-primary/50 cursor-pointer transition-all duration-150 px-4 py-2 bg-elevated/50"
            @click="open(entry)"
          >
            <UIcon
              :name="entryIcon(entry)"
              class="size-5 shrink-0"
              :class="entry.type === 'dir' ? 'text-primary' : 'text-muted'"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-mono truncate">
                <span v-if="search" class="text-muted">{{
                  parentLabel(entry.path)
                }}</span
                ><span class="font-medium">{{ displayName(entry) }}</span>
              </p>
            </div>
            <div class="w-24 text-right text-sm text-muted">
              {{ entry.type === "dir" ? "" : formatSize(entry.size) }}
            </div>
            <div class="w-16 flex justify-end">
              <UDropdownMenu
                v-if="entryMenuItems(entry).length"
                :items="entryMenuItems(entry)"
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
        v-else-if="status === 'pending'"
        class="text-sm text-muted py-8 text-center"
      >
        <UIcon
          name="i-heroicons-arrow-path-20-solid"
          class="size-5 mx-auto animate-spin opacity-60"
        />
      </div>
      <div v-else class="text-sm text-muted py-8 text-center">
        {{
          search
            ? "No matches."
            : currentDir
              ? "This folder is empty."
              : "No files yet — most appear after the server's first start."
        }}
      </div>
    </div>

    <!-- Upload -->
    <UModal
      v-model:open="uploadOpen"
      title="Upload files"
      :description="`Into ${currentDir}/`"
    >
      <template #body>
        <div class="space-y-3">
          <UFileUpload
            v-model="uploadSelection"
            multiple
            variant="area"
            layout="list"
            :file-image="false"
            icon="i-heroicons-arrow-up-tray-20-solid"
            label="Drop files here"
            description="Any file type, max 50 MB in total"
            :disabled="uploading"
            class="min-h-32"
          />
          <UAlert
            v-if="overwrites.length"
            icon="i-heroicons-exclamation-triangle"
            color="warning"
            variant="soft"
            title="These files already exist and will be replaced"
            :description="overwrites.join(', ')"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="uploading"
            @click="uploadOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            :loading="uploading"
            :disabled="!uploadSelection.length"
            :color="overwrites.length ? 'warning' : 'primary'"
            @click="upload"
          >
            {{ overwrites.length ? "Upload and replace" : "Upload" }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- New file / new folder / rename -->
    <UModal
      v-model:open="nameOpen"
      :title="nameDialogTitle"
      :description="nameDialogDescription"
    >
      <template #body>
        <form @submit.prevent="submitName">
          <UInput
            v-model="nameInput"
            autofocus
            class="w-full font-mono"
            :placeholder="nameMode === 'folder' ? 'schematics' : 'config.yml'"
          />
          <p v-if="nameError" class="text-sm text-error mt-2">
            {{ nameError }}
          </p>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="nameSaving"
            @click="nameOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            :loading="nameSaving"
            :disabled="!nameInput.trim()"
            @click="submitName"
          >
            {{ nameMode === "rename" ? "Rename" : "Create" }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete -->
    <UModal
      v-model:open="deleteOpen"
      :title="pendingDelete?.type === 'dir' ? 'Delete folder' : 'Delete file'"
      :description="
        pendingDelete?.type === 'dir'
          ? `Delete ${pendingDelete?.path}/ and everything in it?`
          : `Delete ${pendingDelete?.path}?`
      "
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

    <!-- Editor -->
    <UModal
      v-model:open="editorOpen"
      :title="editingPath"
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
  </UCard>
</template>

<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem } from "@nuxt/ui";
import { errorMessage } from "~/utils/errors";

type FileEntry = { path: string; size: number; type: "file" | "dir" };
type Listing = { roots: string[]; entries: FileEntry[]; truncated: boolean };

const restartAfter = defineModel<boolean>("restartAfter", { default: true });

const { id } = useServerDetail();
const toast = useToast();
const colorMode = useColorMode();

const {
  data: listing,
  refresh,
  status,
} = useFetch<Listing>(() => `/api/server/${id.value}/files`, {
  retry: false,
  immediate: true,
});

const currentDir = ref("");
const search = ref("");

const entries = computed(() => listing.value?.entries ?? []);
const roots = computed(() => listing.value?.roots ?? []);
const existingPaths = computed(
  () => new Set(entries.value.map((entry) => entry.path))
);

function parentOf(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function byFoldersFirst(a: FileEntry, b: FileEntry) {
  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
  return a.path.localeCompare(b.path);
}

/** The scope root the current folder lives in (roots may contain slashes). */
const currentRoot = computed(() =>
  roots.value.find(
    (root) =>
      currentDir.value === root || currentDir.value.startsWith(`${root}/`)
  )
);

const visible = computed<FileEntry[]>(() => {
  const query = search.value.trim().toLowerCase();
  if (query) {
    return entries.value
      .filter((entry) => entry.path.toLowerCase().includes(query))
      .sort(byFoldersFirst);
  }

  // Top level: the scope roots (shown even before they exist on disk, so you
  // can upload into e.g. datapacks/ right away) plus root-level configs.
  if (!currentDir.value) {
    return [
      ...roots.value.map((root) => ({
        path: root,
        size: 0,
        type: "dir" as const,
      })),
      ...entries.value.filter(
        (entry) => entry.type === "file" && !entry.path.includes("/")
      ),
    ];
  }

  return entries.value
    .filter((entry) => parentOf(entry.path) === currentDir.value)
    .sort(byFoldersFirst);
});

const breadcrumb = computed<BreadcrumbItem[]>(() => {
  const items: BreadcrumbItem[] = [
    {
      label: "Files",
      icon: "i-heroicons-folder-20-solid",
      onClick: () => (currentDir.value = ""),
    },
  ];
  const root = currentRoot.value;
  if (!root) return items;

  items.push({ label: root, onClick: () => (currentDir.value = root) });
  let path = root;
  for (const segment of currentDir.value
    .slice(root.length)
    .split("/")
    .filter(Boolean)) {
    path += `/${segment}`;
    const target = path;
    items.push({ label: segment, onClick: () => (currentDir.value = target) });
  }
  return items;
});

function isRoot(entry: FileEntry) {
  return entry.type === "dir" && roots.value.includes(entry.path);
}

function displayName(entry: FileEntry) {
  // Roots like "world/datapacks" read better whole than as "datapacks".
  if (isRoot(entry) && !search.value) return entry.path;
  return entry.path.split("/").pop() ?? entry.path;
}

function parentLabel(path: string) {
  const parent = parentOf(path);
  return parent ? `${parent}/` : "";
}

// Opening these in the text editor is pointless; they download instead. The
// server rejects other binaries too, this just avoids the round trip.
const BINARY_EXTENSIONS = [
  ".schem",
  ".schematic",
  ".litematic",
  ".nbt",
  ".mcstructure",
  ".dat",
  ".dat_old",
  ".mca",
  ".zip",
  ".gz",
  ".tar",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ogg",
  ".mp3",
  ".wav",
  ".db",
  ".sqlite",
  ".class",
  ".bin",
];

function isBinary(path: string) {
  const lower = path.toLowerCase();
  return BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function entryIcon(entry: FileEntry) {
  if (entry.type === "dir") return "i-heroicons-folder-20-solid";
  const lower = entry.path.toLowerCase();
  if (lower.endsWith(".schem") || lower.endsWith(".schematic"))
    return "i-heroicons-cube-20-solid";
  if (isBinary(lower)) return "i-heroicons-document-20-solid";
  if (lower.endsWith(".json")) return "i-heroicons-code-bracket-20-solid";
  if (lower.endsWith(".toml") || lower.endsWith(".properties"))
    return "i-heroicons-adjustments-horizontal-20-solid";
  return "i-heroicons-document-text-20-solid";
}

function open(entry: FileEntry) {
  if (entry.type === "dir") {
    currentDir.value = entry.path;
    search.value = "";
  } else if (isBinary(entry.path)) {
    download(entry.path);
  } else {
    openEditor(entry.path);
  }
}

function download(path: string) {
  window.open(
    `/api/server/${id.value}/files/content?path=${encodeURIComponent(path)}&download=true`,
    "_blank"
  );
}

function entryMenuItems(entry: FileEntry): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = [];
  if (entry.type === "dir") {
    items.push({
      label: "Open",
      icon: "i-heroicons-folder-open-20-solid",
      onSelect: () => open(entry),
    });
  } else {
    if (!isBinary(entry.path)) {
      items.push({
        label: "Edit",
        icon: "i-heroicons-pencil-square-20-solid",
        onSelect: () => openEditor(entry.path),
      });
    }
    items.push({
      label: "Download",
      icon: "i-heroicons-arrow-down-tray-20-solid",
      onSelect: () => download(entry.path),
    });
  }

  // Scope roots are fixed — they can be opened, not renamed or removed.
  if (!isRoot(entry)) {
    items.push(
      {
        label: "Rename",
        icon: "i-heroicons-pencil-20-solid",
        onSelect: () => openName("rename", entry),
      },
      {
        label: "Delete",
        icon: "i-heroicons-trash-20-solid",
        color: "error",
        onSelect: () => {
          pendingDelete.value = entry;
          deleteOpen.value = true;
        },
      }
    );
  }
  return items;
}

// --- Upload ------------------------------------------------------------------------

const uploadOpen = ref(false);
const uploadSelection = ref<File[]>([]);
const uploading = ref(false);
const dragging = ref(false);

const overwrites = computed(() =>
  uploadSelection.value
    .map((file) => file.name)
    .filter((name) => existingPaths.value.has(`${currentDir.value}/${name}`))
);

function openUpload(files: File[] = []) {
  uploadSelection.value = files;
  uploadOpen.value = true;
}

function onDragOver(event: DragEvent) {
  if (!currentDir.value || search.value) return;
  if (event.dataTransfer?.types.includes("Files")) dragging.value = true;
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  if (!currentDir.value || search.value) return;
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length) openUpload(files);
}

async function upload() {
  if (!uploadSelection.value.length) return;
  uploading.value = true;
  try {
    const body = new FormData();
    for (const file of uploadSelection.value) body.append("files", file);
    const result = await $fetch<{ written: string[] }>(
      `/api/server/${id.value}/files/upload`,
      { method: "POST", query: { dir: currentDir.value }, body }
    );
    toast.add({
      title: `${result.written.length} ${result.written.length === 1 ? "file" : "files"} uploaded`,
      color: "success",
    });
    uploadOpen.value = false;
    uploadSelection.value = [];
    await refresh();
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

// --- New file / new folder / rename --------------------------------------------------

type NameMode = "file" | "folder" | "rename";

const nameOpen = ref(false);
const nameMode = ref<NameMode>("file");
const nameInput = ref("");
const nameError = ref("");
const nameSaving = ref(false);
const renaming = ref<FileEntry | null>(null);

const newMenuItems = computed<DropdownMenuItem[]>(() => [
  {
    label: "New file",
    icon: "i-heroicons-document-plus-20-solid",
    onSelect: () => openName("file"),
  },
  {
    label: "New folder",
    icon: "i-heroicons-folder-plus-20-solid",
    // Top level only holds the fixed roots and root-level configs.
    disabled: !currentDir.value,
    onSelect: () => openName("folder"),
  },
]);

const nameDialogTitle = computed(
  () =>
    ({ file: "New file", folder: "New folder", rename: "Rename" })[
      nameMode.value
    ]
);

const nameDialogDescription = computed(() =>
  nameMode.value === "rename"
    ? renaming.value?.path
    : currentDir.value
      ? `In ${currentDir.value}/`
      : "Top level — only server configs (.yml, .yaml, .toml) can live here."
);

function openName(mode: NameMode, entry?: FileEntry) {
  nameMode.value = mode;
  renaming.value = entry ?? null;
  nameInput.value = entry ? (entry.path.split("/").pop() ?? "") : "";
  nameError.value = "";
  nameOpen.value = true;
}

async function submitName() {
  const name = nameInput.value.trim();
  if (!name) return;
  if (name.includes("/") || name.includes("\\")) {
    nameError.value = "Names can't contain slashes.";
    return;
  }

  nameSaving.value = true;
  nameError.value = "";
  try {
    if (nameMode.value === "rename" && renaming.value) {
      const parent = parentOf(renaming.value.path);
      await $fetch(`/api/server/${id.value}/files/move`, {
        method: "POST",
        body: {
          from: renaming.value.path,
          to: parent ? `${parent}/${name}` : name,
        },
      });
    } else {
      const path = currentDir.value ? `${currentDir.value}/${name}` : name;
      if (existingPaths.value.has(path)) {
        nameError.value = "A file or folder with that name already exists.";
        return;
      }
      if (nameMode.value === "folder") {
        await $fetch(`/api/server/${id.value}/files/folder`, {
          method: "POST",
          body: { path },
        });
      } else {
        await $fetch(`/api/server/${id.value}/files/content`, {
          method: "PUT",
          body: { path, content: "" },
        });
        nameOpen.value = false;
        await refresh();
        openEditor(path);
        return;
      }
    }
    nameOpen.value = false;
    await refresh();
  } catch (error) {
    nameError.value = errorMessage(error, "Could not save the change.");
  } finally {
    nameSaving.value = false;
  }
}

// --- Delete ------------------------------------------------------------------------

const deleteOpen = ref(false);
const deleting = ref(false);
const pendingDelete = ref<FileEntry | null>(null);

async function runDelete() {
  if (!pendingDelete.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/server/${id.value}/files`, {
      method: "DELETE",
      query: { path: pendingDelete.value.path },
    });
    toast.add({
      title: `${pendingDelete.value.path} deleted`,
      color: "success",
    });
    deleteOpen.value = false;
    await refresh();
  } catch (error) {
    toast.add({
      title: "Delete failed",
      description: errorMessage(error, "Could not delete it."),
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
}

// --- Editor ------------------------------------------------------------------------

const editorOpen = ref(false);
const editorLoading = ref(false);
const editingPath = ref("");
const draft = ref("");
const editorError = ref("");
const saving = ref(false);

const editorTheme = computed(() =>
  colorMode.value === "dark" ? "vitesse-dark" : "vitesse-light"
);

const editorLanguage = computed(() => {
  const path = editingPath.value.toLowerCase();
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  if (path.endsWith(".json") || path.endsWith(".mcmeta")) return "json";
  if (path.endsWith(".toml")) return "toml";
  if (path.endsWith(".properties") || path.endsWith(".ini")) return "ini";
  return "plaintext";
});

async function openEditor(path: string) {
  editingPath.value = path;
  editorError.value = "";
  draft.value = "";
  editorOpen.value = true;
  editorLoading.value = true;
  try {
    const result = await $fetch<{ path: string; content: string }>(
      `/api/server/${id.value}/files/content`,
      { query: { path } }
    );
    draft.value = result.content;
  } catch (error) {
    editorError.value = errorMessage(error, "Could not read the file.");
  } finally {
    editorLoading.value = false;
  }
}

async function save() {
  if (!editingPath.value) return;
  saving.value = true;
  editorError.value = "";
  try {
    const result = await $fetch<{ ok: boolean; restarted: boolean }>(
      `/api/server/${id.value}/files/content`,
      {
        method: "PUT",
        body: {
          path: editingPath.value,
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
    await refresh();
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

// --- Container identity changes (config edits recreate the container) ---------------

watch(id, () => {
  currentDir.value = "";
  search.value = "";
  editorOpen.value = false;
  uploadOpen.value = false;
  refresh();
});
</script>
