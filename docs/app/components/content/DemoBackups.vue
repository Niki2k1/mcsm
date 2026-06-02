<template>
  <div class="not-prose">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold">World backups</h3>
            <p class="text-sm text-muted">
              Snapshots of the world volume, stored on the
              <code class="text-xs">mcsm-backups</code> volume.
              <UBadge variant="subtle" size="sm" class="ml-1">demo data</UBadge>
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
            <UButton icon="i-lucide-archive" :loading="creating" @click="create">
              Create backup
            </UButton>
          </div>
        </div>
      </template>

      <div v-if="!backups.length" class="text-sm text-muted py-10 text-center space-y-2">
        <UIcon name="i-lucide-archive" class="size-8 mx-auto opacity-60" />
        <p>No backups yet.</p>
        <p class="text-xs">
          Backups snapshot the whole world volume and can be restored at any time.
        </p>
      </div>

      <div v-else class="divide-y divide-default">
        <div
          v-for="backup in backups"
          :key="backup.id"
          class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <UIcon name="i-lucide-archive" class="size-5 text-muted shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              {{ backup.label || formatDate(backup.createdAt) }}
            </p>
            <p class="text-xs text-muted">
              {{ formatDate(backup.createdAt) }} · {{ formatSize(backup.sizeBytes) }}
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-download"
              aria-label="Download backup"
              @click="download"
            >
              Download
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              color="warning"
              icon="i-lucide-undo-2"
              :disabled="busy"
              @click="confirmRestore(backup)"
            >
              Restore
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-trash-2"
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
          icon="i-lucide-triangle-alert"
          color="warning"
          variant="soft"
          title="The server restarts during the restore"
          description="Current world data is replaced by the backup. Anything built since the backup was taken is lost. The server is stopped, restored, and started again."
        />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" :disabled="restoring" @click="restoreOpen = false">
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
          <UButton color="neutral" variant="ghost" :disabled="deleting" @click="deleteOpen = false">
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
// Interactive recreation of MCSM's Backups tab. Everything here is local demo
// state — the real component drives the same UI against MCSM's backups API,
// which tars the world volume via disposable helper containers.

type Backup = {
  id: number;
  label: string | null;
  sizeBytes: number;
  createdAt: number;
};

const toast = useToast();

const backups = ref<Backup[]>([]);
let nextId = 1;

// Seed demo entries client-side so SSR and hydration agree on timestamps.
onMounted(() => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  backups.value = [
    { id: nextId++, label: "Before the dragon fight", sizeBytes: 142 * 1024 * 1024, createdAt: now - 26 * hour },
    { id: nextId++, label: null, sizeBytes: 121 * 1024 * 1024, createdAt: now - 3 * 24 * hour },
    { id: nextId++, label: "Season 3 final", sizeBytes: 96 * 1024 * 1024, createdAt: now - 9 * 24 * hour },
  ];
});

// --- Create -------------------------------------------------------------------

const creating = ref(false);
const newLabel = ref("");

async function create() {
  creating.value = true;
  // The real backup tars the world volume — simulate the wait.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  backups.value.unshift({
    id: nextId++,
    label: newLabel.value || null,
    sizeBytes: Math.round((110 + Math.random() * 60) * 1024 * 1024),
    createdAt: Date.now(),
  });
  newLabel.value = "";
  creating.value = false;
  toast.add({ title: "Backup created", color: "success" });
}

// --- Download (demo) -----------------------------------------------------------

function download() {
  toast.add({
    title: "This is a live demo",
    description: "In MCSM this downloads the backup as a .tar.gz.",
    color: "info",
  });
}

// --- Restore / delete -----------------------------------------------------------

const pending = ref<Backup | null>(null);
const restoreOpen = ref(false);
const deleteOpen = ref(false);
const restoring = ref(false);
const deleting = ref(false);

const busy = computed(() => creating.value || restoring.value || deleting.value);

function confirmRestore(backup: Backup) {
  pending.value = backup;
  restoreOpen.value = true;
}

function confirmDelete(backup: Backup) {
  pending.value = backup;
  deleteOpen.value = true;
}

async function runRestore() {
  restoring.value = true;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  restoring.value = false;
  restoreOpen.value = false;
  toast.add({
    title: "Backup restored",
    description: "The server is starting with the restored world.",
    color: "success",
  });
}

async function runDelete() {
  if (!pending.value) return;
  deleting.value = true;
  await new Promise((resolve) => setTimeout(resolve, 600));
  backups.value = backups.value.filter((backup) => backup.id !== pending.value!.id);
  deleting.value = false;
  deleteOpen.value = false;
  toast.add({ title: "Backup deleted", color: "success" });
}

// --- Formatting ------------------------------------------------------------------

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatSize(bytes: number) {
  const mib = bytes / 1024 / 1024;
  if (mib < 1024) return `${Math.round(mib * 10) / 10} MiB`;
  return `${Math.round((mib / 1024) * 100) / 100} GiB`;
}
</script>
