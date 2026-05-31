<template>
  <UContainer>
    <UPage>
      <template v-if="server">
        <UPageHeader
          :headline="typeMeta.label"
          :title="server.name"
          :description="server.domain"
        >
          <template #headline>
            <div class="flex items-center gap-2">
              <img
                v-if="typeMeta.icon"
                :src="typeMeta.icon"
                :alt="typeMeta.label"
                class="size-5"
              />
              <span>{{ typeMeta.label }}</span>
              <UBadge :color="statusColor" variant="soft">
                <UIcon
                  v-if="status === 'pending'"
                  name="i-heroicons-arrow-path-20-solid"
                  class="animate-spin"
                />
                {{ statusText }}
              </UBadge>
            </div>
          </template>

          <template #links>
            <UButton
              icon="i-heroicons-arrow-left-20-solid"
              color="neutral"
              variant="ghost"
              to="/"
            >
              Back
            </UButton>
          </template>
        </UPageHeader>

        <UPageBody>
          <!-- Overview + actions -->
          <UCard>
            <div class="space-y-4">
              <MotdPreview :motd="motd" class="min-h-[1.2em]" />

              <div
                v-if="status === 'success'"
                class="flex gap-6 text-sm text-muted"
              >
                <span class="flex gap-2 items-center">
                  <UIcon name="i-heroicons-users-20-solid" />
                  {{ info?.status.players.online }}/{{
                    info?.status.players.max
                  }}
                  players
                </span>
                <span class="flex gap-2 items-center">
                  <UIcon name="i-tabler-wave-saw-tool" />
                  {{ info?.latency }}ms
                </span>
              </div>

              <div class="flex flex-wrap gap-2">
                <UButton
                  v-if="server.running"
                  icon="i-heroicons-stop-20-solid"
                  color="warning"
                  variant="soft"
                  :loading="toggling"
                  @click="setRunning(false)"
                >
                  Stop
                </UButton>
                <UButton
                  v-else
                  icon="i-heroicons-play-20-solid"
                  color="success"
                  variant="soft"
                  :loading="toggling"
                  @click="setRunning(true)"
                >
                  Start
                </UButton>

                <UButton
                  icon="i-heroicons-command-line-20-solid"
                  color="neutral"
                  variant="soft"
                  @click="openConsole"
                >
                  Console
                </UButton>

                <UButton
                  v-if="server.running"
                  icon="i-heroicons-arrow-path-20-solid"
                  color="neutral"
                  variant="soft"
                  :loading="restarting"
                  @click="restart"
                >
                  Restart
                </UButton>

                <UButton
                  icon="i-heroicons-pencil-square-20-solid"
                  color="neutral"
                  variant="soft"
                  @click="openEdit"
                >
                  Edit
                </UButton>

                <UButton
                  icon="i-heroicons-trash-20-solid"
                  color="error"
                  variant="soft"
                  class="ml-auto"
                  @click="deleteOpen = true"
                >
                  Delete
                </UButton>
              </div>
            </div>
          </UCard>

          <!-- Paper plugins -->
          <UCard v-if="isPaper" class="mt-6">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div>
                  <h2 class="text-lg font-semibold">Plugins</h2>
                  <p class="text-sm text-muted">
                    Upload <code>.jar</code> plugins or a <code>.zip</code>
                    bundle. The server restarts to load changes while running.
                  </p>
                </div>
                <input
                  ref="fileInput"
                  type="file"
                  accept=".jar,.zip"
                  multiple
                  class="hidden"
                  @change="onFiles"
                />
                <UButton
                  icon="i-heroicons-arrow-up-tray-20-solid"
                  :loading="uploading"
                  @click="fileInput?.click()"
                >
                  Upload
                </UButton>
              </div>
            </template>

            <div
              v-if="!plugins.length"
              class="text-center py-10 text-muted space-y-2"
            >
              <UIcon
                name="i-heroicons-puzzle-piece"
                class="size-8 mx-auto opacity-60"
              />
              <p>No plugins installed yet.</p>
            </div>

            <ul v-else class="divide-y divide-default">
              <li
                v-for="plugin in plugins"
                :key="plugin.name"
                class="flex items-center justify-between gap-2 py-2"
              >
                <span class="flex items-center gap-2 min-w-0">
                  <UIcon
                    name="i-heroicons-puzzle-piece-20-solid"
                    class="shrink-0 text-muted"
                  />
                  <span class="truncate font-mono text-sm">{{
                    plugin.name
                  }}</span>
                </span>
                <span class="flex items-center gap-3 shrink-0">
                  <span class="text-xs text-muted">{{
                    formatBytes(plugin.size)
                  }}</span>
                  <UButton
                    icon="i-heroicons-trash-20-solid"
                    color="error"
                    variant="ghost"
                    size="xs"
                    aria-label="Delete plugin"
                    :loading="deletingPlugin === plugin.name"
                    @click="removePlugin(plugin.name)"
                  />
                </span>
              </li>
            </ul>
          </UCard>

          <!-- Config files -->
          <UCard v-if="isPaper" class="mt-6">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div>
                  <h2 class="text-lg font-semibold">Config files</h2>
                  <p class="text-sm text-muted">
                    Edit plugin config files in <code>/plugins</code>. Restart
                    the server to apply changes.
                  </p>
                </div>
                <UButton
                  icon="i-heroicons-arrow-path-20-solid"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :loading="filesPending"
                  aria-label="Refresh files"
                  @click="refreshFiles()"
                />
              </div>
            </template>

            <div
              v-if="!fileGroups.length"
              class="text-center py-10 text-muted space-y-2"
            >
              <UIcon
                name="i-heroicons-document-text"
                class="size-8 mx-auto opacity-60"
              />
              <p>No config files yet. They appear once a plugin first runs.</p>
            </div>

            <div v-else class="space-y-4">
              <div v-for="group in fileGroups" :key="group.name">
                <p class="text-xs font-semibold uppercase text-muted mb-1">
                  {{ group.name }}
                </p>
                <ul class="divide-y divide-default">
                  <li
                    v-for="file in group.files"
                    :key="file.path"
                    class="flex items-center justify-between gap-2 py-2"
                  >
                    <button
                      type="button"
                      class="flex items-center gap-2 min-w-0 text-left hover:text-primary"
                      @click="openFile(file.path)"
                    >
                      <UIcon
                        name="i-heroicons-document-text-20-solid"
                        class="shrink-0 text-muted"
                      />
                      <span class="truncate font-mono text-sm">{{
                        file.label
                      }}</span>
                    </button>
                    <span class="text-xs text-muted shrink-0">{{
                      formatBytes(file.size)
                    }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </UCard>
        </UPageBody>
      </template>

      <div v-else class="text-center py-24 text-muted space-y-4">
        <UIcon
          name="i-heroicons-exclamation-triangle"
          class="size-10 mx-auto opacity-60"
        />
        <p>Server not found.</p>
        <UButton icon="i-heroicons-arrow-left-20-solid" to="/">
          Back to dashboard
        </UButton>
      </div>
    </UPage>

    <!-- Delete confirmation -->
    <UModal
      v-model:open="deleteOpen"
      title="Delete server"
      :description="`Remove “${server?.name}”? The world volume is kept and can be recovered.`"
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="deleteOpen = false">
            Cancel
          </UButton>
          <UButton color="error" :loading="deleting" @click="runDelete">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Config file editor -->
    <UModal
      v-model:open="editorOpen"
      :title="editorPath ? editorPath.replace(/^plugins\//, '') : 'Edit file'"
      :ui="{ content: 'max-w-5xl' }"
    >
      <template #body>
        <div
          v-if="editorLoading"
          class="h-[60vh] flex items-center justify-center text-muted"
        >
          <UIcon
            name="i-heroicons-arrow-path-20-solid"
            class="animate-spin size-6"
          />
        </div>
        <ClientOnly v-else>
          <CodeEditor
            v-model="editorContent"
            :language="editorLanguage"
            :theme="editorTheme"
            class="h-[60vh] rounded-md overflow-hidden ring-1 ring-default"
          />
        </ClientOnly>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="editorOpen = false">
            Cancel
          </UButton>
          <UButton :loading="saving" :disabled="editorLoading" @click="saveFile">
            Save
          </UButton>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>

<script setup lang="ts">
import { chatToMotd } from "~/utils/motd";
import MotdPreview from "~/components/server/motd/MotdPreview.vue";

import vanilla from "~/assets/vanilla.webp";
import ftb from "~/assets/ftb.svg";
import curseforge from "~/assets/curseforge.svg";
import paper from "~/assets/paper.svg";
import fabric from "~/assets/fabric.png";
import forge from "~/assets/forge.svg";

type Plugin = { name: string; size: number };
type ServerDetail = {
  id: string;
  name: string;
  domain: string;
  running: boolean;
  config: { type: string | null } | null;
};

const route = useRoute();
const toast = useToast();
const serverModal = useServerModal();
const consoleModal = useConsoleModal();

const { data: server, refresh: refreshServer } = await useFetch<ServerDetail>(
  () => `/api/server/${route.params.id}`,
  { key: () => `server-${route.params.id}` }
);

const isPaper = computed(() => server.value?.config?.type === "PAPER");

const TYPE_META: Record<string, { label: string; icon?: string }> = {
  VANILLA: { label: "Vanilla", icon: vanilla },
  FTBA: { label: "Feed The Beast", icon: ftb },
  AUTO_CURSEFORGE: { label: "CurseForge", icon: curseforge },
  PAPER: { label: "Paper", icon: paper },
  FABRIC: { label: "Fabric", icon: fabric },
  FORGE: { label: "Forge", icon: forge },
};

const typeMeta = computed(
  () =>
    TYPE_META[server.value?.config?.type ?? ""] ?? { label: "Server" }
);

// Live status ping (mirrors the dashboard card).
const {
  data: info,
  status: pingStatus,
  refresh: refreshPing,
} = useFetch("/api/minecraft/server/info", {
  query: computed(() => ({ host: server.value?.domain })),
  key: () => `ping-${server.value?.domain}`,
  retry: false,
});

const motd = computed(() => chatToMotd(info.value?.status?.description));

const interval = ref<NodeJS.Timeout | null>(null);
onMounted(() => {
  interval.value = setInterval(refreshPing, 60000);
});
onUnmounted(() => {
  if (interval.value) clearInterval(interval.value);
});

const status = computed(() => pingStatus.value);
const statusColor = computed(() => {
  switch (status.value) {
    case "success":
      return "success";
    case "error":
      return "error";
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
});
const statusText = computed(() => {
  switch (status.value) {
    case "success":
      return "Online";
    case "error":
      return "Offline";
    case "pending":
      return "Loading...";
    default:
      return "Unknown";
  }
});

// Actions ------------------------------------------------------------------
const toggling = ref(false);
async function setRunning(running: boolean) {
  toggling.value = true;
  try {
    await $fetch(`/api/server/${server.value!.id}/${running ? "start" : "stop"}`, {
      method: "POST",
    });
    toast.add({
      title: running ? "Server starting" : "Server stopping",
      color: "success",
    });
    await refreshServer();
    await refreshNuxtData("servers");
  } catch {
    toast.add({
      title: "Error",
      description: `Failed to ${running ? "start" : "stop"} server.`,
      color: "error",
    });
  } finally {
    toggling.value = false;
  }
}

function openConsole() {
  if (!server.value) return;
  consoleModal.open({
    id: server.value.id,
    name: server.value.name,
    running: server.value.running,
  });
}

function openEdit() {
  if (!server.value) return;
  // Saving recreates the container (new id), so follow it to the new route.
  serverModal.openEdit(server.value.id, (result) =>
    navigateTo(`/server/${result.id}`)
  );
}

const deleteOpen = ref(false);
const deleting = ref(false);
async function runDelete() {
  if (!server.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/server/${server.value.id}`, { method: "DELETE" });
    toast.add({ title: "Server deleted", color: "success" });
    await refreshNuxtData("servers");
    await navigateTo("/");
  } catch {
    toast.add({
      title: "Error",
      description: "Failed to delete server.",
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
}

// Plugins ------------------------------------------------------------------
const { data: plugins, refresh: refreshPlugins } = await useFetch<Plugin[]>(
  () => `/api/server/${route.params.id}/plugins`,
  { key: () => `plugins-${route.params.id}`, default: () => [], immediate: isPaper.value }
);

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const deletingPlugin = ref<string | null>(null);

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files?.length) return;

  const body = new FormData();
  for (const file of files) body.append("files", file);

  uploading.value = true;
  try {
    const result = await $fetch<{ added: string[]; restarted: boolean }>(
      `/api/server/${server.value!.id}/plugins`,
      { method: "POST", body }
    );
    toast.add({
      title: `Added ${result.added.length} plugin${result.added.length === 1 ? "" : "s"}`,
      description: result.restarted
        ? "The server is restarting to load them."
        : "Start the server to load them.",
      color: "success",
    });
    await refreshPlugins();
  } catch (error) {
    toast.add({
      title: "Upload failed",
      description: uploadError(error),
      color: "error",
    });
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

async function removePlugin(name: string) {
  deletingPlugin.value = name;
  try {
    await $fetch(
      `/api/server/${server.value!.id}/plugins/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );
    toast.add({ title: `Removed ${name}`, color: "success" });
    await refreshPlugins();
  } catch (error) {
    toast.add({
      title: "Delete failed",
      description: uploadError(error),
      color: "error",
    });
  } finally {
    deletingPlugin.value = null;
  }
}

// Restart -----------------------------------------------------------------
const restarting = ref(false);
async function restart() {
  restarting.value = true;
  try {
    await $fetch(`/api/server/${server.value!.id}/restart`, { method: "POST" });
    toast.add({ title: "Server restarting", color: "success" });
    await refreshServer();
  } catch {
    toast.add({
      title: "Error",
      description: "Failed to restart server.",
      color: "error",
    });
  } finally {
    restarting.value = false;
  }
}

// Config files -------------------------------------------------------------
const {
  data: files,
  refresh: refreshFiles,
  status: filesStatus,
} = await useFetch<{ path: string; size: number }[]>(
  () => `/api/server/${route.params.id}/files`,
  {
    key: () => `files-${route.params.id}`,
    default: () => [],
    immediate: isPaper.value,
  }
);
const filesPending = computed(() => filesStatus.value === "pending");

// Group flat paths ("plugins/Foo/config.yml") by their plugin folder.
const fileGroups = computed(() => {
  const groups: Record<
    string,
    { path: string; label: string; size: number }[]
  > = {};
  for (const file of files.value) {
    const rel = file.path.replace(/^plugins\//, "");
    const slash = rel.indexOf("/");
    const name = slash === -1 ? "plugins" : rel.slice(0, slash);
    const label = slash === -1 ? rel : rel.slice(slash + 1);
    (groups[name] ??= []).push({ path: file.path, label, size: file.size });
  }
  return Object.entries(groups)
    .map(([name, entries]) => ({ name, files: entries }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

const colorMode = useColorMode();
const editorTheme = computed(() =>
  colorMode.value === "light" ? "vitesse-light" : "vitesse-dark"
);

const editorOpen = ref(false);
const editorPath = ref<string | null>(null);
const editorContent = ref("");
const editorLanguage = ref("plaintext");
const editorLoading = ref(false);
const saving = ref(false);

function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "yml":
    case "yaml":
      return "yaml";
    case "json":
      return "json";
    case "toml":
      return "toml";
    case "properties":
    case "conf":
    case "cfg":
    case "ini":
      return "ini";
    default:
      return "plaintext";
  }
}

async function openFile(path: string) {
  editorPath.value = path;
  editorLanguage.value = languageFromPath(path);
  editorContent.value = "";
  editorLoading.value = true;
  editorOpen.value = true;
  try {
    const result = await $fetch<{ path: string; content: string }>(
      `/api/server/${server.value!.id}/files/content`,
      { query: { path } }
    );
    editorContent.value = result.content;
  } catch (error) {
    toast.add({
      title: "Could not open file",
      description: uploadError(error),
      color: "error",
    });
    editorOpen.value = false;
  } finally {
    editorLoading.value = false;
  }
}

async function saveFile() {
  if (!editorPath.value) return;
  saving.value = true;
  try {
    await $fetch(`/api/server/${server.value!.id}/files/content`, {
      method: "PUT",
      body: { path: editorPath.value, content: editorContent.value },
    });
    toast.add({
      title: "Saved",
      description: "Restart the server to apply.",
      color: "success",
    });
    editorOpen.value = false;
    await refreshFiles();
  } catch (error) {
    toast.add({
      title: "Save failed",
      description: uploadError(error),
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

function uploadError(error: unknown): string {
  const data = (error as { data?: { statusMessage?: string } })?.data;
  return data?.statusMessage ?? "Something went wrong.";
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** exp).toFixed(exp ? 1 : 0)} ${units[exp]}`;
}
</script>
