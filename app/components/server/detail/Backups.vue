<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">World backups</h3>
            <p class="text-sm text-muted">
              Snapshots of the world volume, stored on the
              <code class="text-xs">mcsm-backups</code> volume.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UInput
              v-model.trim="newLabel"
              placeholder="Label (optional)"
              size="sm"
              class="w-44"
              :disabled="creating"
            />
            <UButton
              icon="i-heroicons-archive-box-arrow-down-20-solid"
              :loading="creating"
              @click="create"
            >
              Create backup
            </UButton>
            <UButton
              icon="i-heroicons-arrow-up-tray-20-solid"
              variant="soft"
              color="neutral"
              :loading="uploading"
              @click="fileInput?.click()"
            >
              Upload
            </UButton>
            <input
              ref="fileInput"
              type="file"
              accept=".tar.gz,.tgz,application/gzip"
              class="hidden"
              @change="onUpload"
            />
          </div>
        </div>
      </template>

      <div
        v-if="!backups?.length"
        class="text-sm text-muted py-10 text-center space-y-2"
      >
        <UIcon
          name="i-heroicons-archive-box"
          class="size-8 mx-auto opacity-60"
        />
        <p>No backups yet.</p>
        <p class="text-xs">
          Backups snapshot the whole world volume and can be restored at any
          time.
        </p>
      </div>

      <div v-else class="divide-y divide-default">
        <div
          v-for="backup in backups"
          :key="backup.id"
          class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <UIcon
            name="i-heroicons-archive-box-20-solid"
            class="size-5 text-muted shrink-0"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              {{ backup.label || formatDate(backup.createdAt) }}
            </p>
            <p class="text-xs text-muted">
              {{ formatDate(backup.createdAt) }} ·
              {{ formatSize(backup.sizeBytes) }}
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-heroicons-arrow-down-tray-20-solid"
              :href="`/api/server/${id}/backups/${backup.id}/download`"
              external
              aria-label="Download backup"
            >
              Download
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              color="warning"
              icon="i-heroicons-arrow-uturn-left-20-solid"
              :disabled="busy"
              @click="confirmRestore(backup)"
            >
              Restore
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              icon="i-heroicons-trash-20-solid"
              :disabled="busy"
              aria-label="Delete backup"
              @click="confirmDelete(backup)"
            />
          </div>
        </div>
      </div>
    </UCard>

    <!-- Restore confirmation -->
    <UModal
      v-model:open="restoreOpen"
      title="Restore backup"
      :description="`The world will be reset to the state from ${pending ? formatDate(pending.createdAt) : ''}.`"
    >
      <template #body>
        <UAlert
          icon="i-heroicons-exclamation-triangle"
          color="warning"
          variant="soft"
          title="The server restarts during the restore"
          description="Current world data is replaced by the backup. Anything built since the backup was taken is lost. The server is stopped, restored, and started again."
        />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="restoring"
            @click="restoreOpen = false"
          >
            Cancel
          </UButton>
          <UButton color="warning" :loading="restoring" @click="runRestore">
            Restore backup
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete confirmation -->
    <UModal
      v-model:open="deleteOpen"
      title="Delete backup"
      :description="`Delete the backup from ${pending ? formatDate(pending.createdAt) : ''}? This can't be undone.`"
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
            Delete backup
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
type Backup = {
  id: number;
  volume: string;
  filename: string;
  sizeBytes: number | null;
  createdAt: number;
  label: string | null;
  state: string;
};

const { id, refresh: refreshServer } = useServerDetail();
const toast = useToast();

const { data: backups, refresh } = useFetch<Backup[]>(
  () => `/api/server/${id.value}/backups`,
  { default: () => [] }
);

// --- Create -----------------------------------------------------------------

const creating = ref(false);
const newLabel = ref("");

async function create() {
  creating.value = true;
  try {
    await $fetch(`/api/server/${id.value}/backups`, {
      method: "POST",
      body: { label: newLabel.value || undefined },
    });
    toast.add({ title: "Backup created", color: "success" });
    newLabel.value = "";
    await refresh();
  } catch {
    toast.add({
      title: "Backup failed",
      description: "Could not create the backup.",
      color: "error",
    });
  } finally {
    creating.value = false;
  }
}

// --- Upload ----------------------------------------------------------------

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const uploading = ref(false);

async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploading.value = true;
  try {
    await $fetch(`/api/server/${id.value}/backups/upload`, {
      method: "POST",
      // Strip the extension for the label; the file itself is the raw body.
      query: { label: file.name.replace(/\.(tar\.gz|tgz)$/i, "") },
      body: file,
    });
    toast.add({
      title: "Backup uploaded",
      description: "The backup was validated and is ready to restore.",
      color: "success",
    });
    await refresh();
  } catch (error) {
    toast.add({
      title: "Upload failed",
      description: errorMessage(error, "Could not upload the backup."),
      color: "error",
    });
  } finally {
    uploading.value = false;
    // Allow re-selecting the same file.
    input.value = "";
  }
}

// --- Restore / delete ----------------------------------------------------------

const pending = ref<Backup | null>(null);
const restoreOpen = ref(false);
const deleteOpen = ref(false);
const restoring = ref(false);
const deleting = ref(false);

const busy = computed(
  () => creating.value || uploading.value || restoring.value || deleting.value
);

function confirmRestore(backup: Backup) {
  pending.value = backup;
  restoreOpen.value = true;
}

function confirmDelete(backup: Backup) {
  pending.value = backup;
  deleteOpen.value = true;
}

async function runRestore() {
  if (!pending.value) return;
  restoring.value = true;
  try {
    await $fetch(
      `/api/server/${id.value}/backups/${pending.value.id}/restore`,
      { method: "POST" }
    );
    toast.add({
      title: "Backup restored",
      description: "The server is starting with the restored world.",
      color: "success",
    });
    restoreOpen.value = false;
    await refreshServer();
  } catch {
    toast.add({
      title: "Restore failed",
      description: "Could not restore the backup.",
      color: "error",
    });
  } finally {
    restoring.value = false;
  }
}

async function runDelete() {
  if (!pending.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/server/${id.value}/backups/${pending.value.id}`, {
      method: "DELETE",
    });
    toast.add({ title: "Backup deleted", color: "success" });
    deleteOpen.value = false;
    await refresh();
  } catch {
    toast.add({
      title: "Delete failed",
      description: "Could not delete the backup.",
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
}

// --- Formatting -------------------------------------------------------------------

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatSize(bytes: number | null) {
  if (!bytes) return "unknown size";
  const mib = bytes / 1024 / 1024;
  if (mib < 1024) return `${Math.round(mib * 10) / 10} MiB`;
  return `${Math.round((mib / 1024) * 100) / 100} GiB`;
}
</script>
