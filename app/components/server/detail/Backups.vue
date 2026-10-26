<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">Automatic backups</h3>
            <p class="text-sm text-muted">
              Back up the world on a schedule and keep the newest ones. Manual
              backups are never deleted.
            </p>
          </div>
          <USwitch
            v-model="schedule.enabled"
            label="Enabled"
            :disabled="savingSchedule"
          />
        </div>
      </template>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UFormField label="Every">
          <USelect
            v-model="schedule.intervalHours"
            :items="intervalItems"
            class="w-full"
            :disabled="!schedule.enabled"
          />
        </UFormField>
        <UFormField
          :label="schedule.intervalHours < 24 ? 'Starting at' : 'At'"
          :hint="timeZone"
        >
          <UInput
            v-model="schedule.atTime"
            type="time"
            class="w-full"
            :disabled="!schedule.enabled"
          />
        </UFormField>
        <UFormField label="Keep" hint="automatic backups">
          <UInputNumber
            v-model="schedule.keep"
            :min="1"
            :max="100"
            class="w-full"
            :disabled="!schedule.enabled"
          />
        </UFormField>
        <UFormField label="Skip idle slots">
          <UCheckbox
            v-model="schedule.onlyIfPlayed"
            label="Only when someone played"
            class="pt-1.5"
            :disabled="!schedule.enabled"
          />
        </UFormField>
      </div>

      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-muted">
            <template v-if="savedSchedule?.enabled && savedSchedule.nextRunAt">
              Next backup {{ formatDate(savedSchedule.nextRunAt) }}.
            </template>
            <template v-else>No automatic backups.</template>
            <template v-if="savedSchedule?.lastRunAt">
              Last run {{ formatDate(savedSchedule.lastRunAt) }}:
              <span :class="lastResultClass">{{ lastResultText }}</span>
            </template>
          </p>
          <UButton
            :loading="savingSchedule"
            :disabled="!scheduleDirty"
            @click="saveSchedule"
          >
            Save schedule
          </UButton>
        </div>
      </template>
    </UCard>

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
            <p class="text-sm font-medium flex items-center gap-2">
              {{ backup.label || formatDate(backup.createdAt) }}
              <UBadge
                v-if="backup.automatic"
                size="sm"
                variant="subtle"
                color="neutral"
              >
                Auto
              </UBadge>
            </p>
            <p class="text-xs text-muted">
              {{ formatDate(backup.createdAt) }} ·
              <span
                v-if="backup.engine === 'restic'"
                title="New data this backup stored. Unchanged parts of the world are shared with the other backups."
              >
                +{{ formatSize(backup.sizeBytes) }} new
              </span>
              <template v-else>{{ formatSize(backup.sizeBytes) }}</template>
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
  engine: "restic" | "tar";
  sizeBytes: number | null;
  createdAt: number;
  label: string | null;
  state: string;
  automatic: boolean;
};

type Schedule = {
  enabled: boolean;
  intervalHours: number;
  atTime: string;
  timeZone: string;
  keep: number;
  onlyIfPlayed: boolean;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastResult: "done" | "skipped" | "failed" | null;
  lastError: string | null;
};

const { id, refresh: refreshServer } = useServerDetail();
const toast = useToast();

const { data: backups, refresh } = useFetch<Backup[]>(
  () => `/api/server/${id.value}/backups`,
  { default: () => [] }
);

// --- Schedule ---------------------------------------------------------------

// Times are entered in the browser's zone and stored with it, so "04:00" stays
// the viewer's 04:00 no matter which zone the MCSM container runs in.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const intervalItems = [
  { label: "Hour", value: 1 },
  { label: "2 hours", value: 2 },
  { label: "3 hours", value: 3 },
  { label: "4 hours", value: 4 },
  { label: "6 hours", value: 6 },
  { label: "8 hours", value: 8 },
  { label: "12 hours", value: 12 },
  { label: "Day", value: 24 },
  { label: "2 days", value: 48 },
  { label: "3 days", value: 72 },
  { label: "Week", value: 168 },
];

const { data: savedSchedule, refresh: refreshSchedule } = useFetch<Schedule>(
  () => `/api/server/${id.value}/backups/schedule`
);

const schedule = reactive({
  enabled: false,
  intervalHours: 24,
  atTime: "04:00",
  keep: 7,
  onlyIfPlayed: true,
});
watch(
  savedSchedule,
  (saved) => {
    if (!saved) return;
    Object.assign(schedule, {
      enabled: saved.enabled,
      intervalHours: saved.intervalHours,
      atTime: saved.atTime,
      keep: saved.keep,
      onlyIfPlayed: saved.onlyIfPlayed,
    });
  },
  { immediate: true }
);

const scheduleDirty = computed(() => {
  const saved = savedSchedule.value;
  if (!saved) return false;
  return (
    saved.enabled !== schedule.enabled ||
    saved.intervalHours !== schedule.intervalHours ||
    saved.atTime !== schedule.atTime ||
    saved.keep !== schedule.keep ||
    saved.onlyIfPlayed !== schedule.onlyIfPlayed ||
    // Re-saving from another zone moves the slots, so count it as a change.
    (schedule.enabled && saved.timeZone !== timeZone)
  );
});

const lastResultText = computed(() => {
  const saved = savedSchedule.value;
  if (saved?.lastResult === "done") return "backup created";
  if (saved?.lastResult === "skipped")
    return saved.lastError ?? "skipped, nobody played";
  if (saved?.lastResult === "failed") return saved.lastError ?? "failed";
  return "";
});
const lastResultClass = computed(() =>
  savedSchedule.value?.lastResult === "failed" ? "text-error" : ""
);

const savingSchedule = ref(false);

async function saveSchedule() {
  savingSchedule.value = true;
  try {
    savedSchedule.value = await $fetch<Schedule>(
      `/api/server/${id.value}/backups/schedule`,
      { method: "PUT", body: { ...schedule, timeZone } }
    );
    toast.add({
      title: schedule.enabled
        ? "Backup schedule saved"
        : "Automatic backups turned off",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Could not save the schedule",
      description: errorMessage(error, "Saving the schedule failed."),
      color: "error",
    });
    await refreshSchedule();
  } finally {
    savingSchedule.value = false;
  }
}

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
  } catch (error) {
    toast.add({
      title: "Backup failed",
      description: errorMessage(error, "Could not create the backup."),
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
  } catch (error) {
    toast.add({
      title: "Restore failed",
      description: errorMessage(error, "Could not restore the backup."),
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
  } catch (error) {
    toast.add({
      title: "Delete failed",
      description: errorMessage(error, "Could not delete the backup."),
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
