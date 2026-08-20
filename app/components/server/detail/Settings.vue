<template>
  <div v-if="server" class="space-y-6">
    <!-- General -->
    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold">General</h3>
          <p class="text-sm text-muted">
            Server identity. Saving recreates the container — the world is
            kept.
          </p>
        </div>
      </template>

      <div v-if="server.config" class="space-y-4 max-w-lg">
        <UFormField label="Server Name" name="name">
          <UInput v-model="general.name" class="w-full" />
        </UFormField>

        <UFormField
          label="Domain"
          name="domain"
          help="Players connect via subdomain.domain — changing it updates the proxy routing."
        >
          <div class="grid grid-cols-3 gap-2">
            <UInput
              v-model="general.subdomain"
              class="col-span-2"
              placeholder="my-server"
            />
            <USelectMenu
              v-model="general.domain"
              :items="domainOptions"
              value-key="value"
              placeholder="Domain"
            />
          </div>
        </UFormField>

        <UFormField
          label="Host Port"
          name="hostPort"
          help="Optionally publish the server on a host port, reachable at <server-ip>:<port>. Leave empty to route through the proxy only."
        >
          <UInput
            v-model.number="hostPort"
            type="number"
            :min="1"
            :max="65535"
            placeholder="25566"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>
      </div>

      <p v-else class="text-sm text-muted">
        This server has no stored configuration, so its identity can't be
        edited here.
      </p>

      <template v-if="server.config" #footer>
        <div class="flex justify-end">
          <UButton
            :disabled="!generalDirty"
            :loading="saving"
            @click="saveGeneral"
          >
            Save
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Danger Zone -->
    <UCard
      class="ring-error/40"
      :ui="{ header: 'bg-error/5 rounded-t-lg' }"
    >
      <template #header>
        <div>
          <h3 class="font-semibold text-error">Danger Zone</h3>
          <p class="text-sm text-muted">Careful — these can't be undone.</p>
        </div>
      </template>

      <div class="divide-y divide-default">
        <div
          v-if="server.config"
          class="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">Change server variant</p>
            <p class="text-xs text-muted">
              Switch the server software (e.g. Vanilla → Paper) to use plugins
              or mods. The world is kept and a backup is created first.
            </p>
          </div>
          <UButton color="error" variant="soft" @click="openMigrate">
            Change variant
          </UButton>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">Delete server</p>
            <p class="text-xs text-muted">
              Removes the container. The world volume is kept, so a new server
              with the same name can pick the world up again.
            </p>
          </div>
          <UButton color="error" variant="soft" @click="openDelete(false)">
            Delete server
          </UButton>
        </div>

        <div
          class="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">Delete server and world</p>
            <p class="text-xs text-muted">
              Removes the container <strong>and</strong> the world volume. All
              world data is permanently lost.
            </p>
          </div>
          <UButton color="error" @click="openDelete(true)">
            Delete everything
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Delete confirmation -->
    <UModal
      v-model:open="deleteOpen"
      :title="
        deleteWithVolume ? 'Delete server and world' : 'Delete server'
      "
      :description="
        deleteWithVolume
          ? 'The container and the world volume will be permanently deleted.'
          : `The container will be removed. The world volume “${server.volume}” is kept.`
      "
    >
      <template #body>
        <div class="space-y-3">
          <UAlert
            v-if="deleteWithVolume"
            icon="i-heroicons-exclamation-triangle"
            color="error"
            variant="soft"
            title="This deletes the world"
            description="There is no way to recover the world data after this."
          />
          <template v-if="deleteWithVolume">
            <p class="text-sm">
              Type
              <span class="font-mono font-semibold">{{ server.name }}</span>
              to confirm.
            </p>
            <UInput
              v-model="confirmName"
              class="w-full"
              :placeholder="server.name"
              autocomplete="off"
            />
          </template>
        </div>
      </template>

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
          <UButton
            color="error"
            :disabled="deleteWithVolume && confirmName !== server.name"
            :loading="deleting"
            @click="runDelete"
          >
            {{ deleteWithVolume ? "Delete everything" : "Delete server" }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Variant migration -->
    <UModal
      v-model:open="migrateOpen"
      title="Change server variant"
      :description="`Currently running ${currentVariantName}. The world is kept — a backup is created before anything changes.`"
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              v-for="variant in variantOptions"
              :key="variant.value"
              type="button"
              class="text-left rounded-lg ring-1 ring-default p-3 flex gap-3 items-center transition-all hover:ring-primary cursor-pointer"
              :class="{ 'ring-2 ring-primary': migrateTarget === variant.value }"
              @click="migrateTarget = variant.value"
            >
              <img
                :src="variant.icon"
                :alt="variant.name"
                class="size-8 shrink-0"
              />
              <div class="min-w-0">
                <p class="text-sm font-semibold">{{ variant.name }}</p>
                <p class="text-xs text-muted">{{ variant.description }}</p>
              </div>
            </button>
          </div>

          <UAlert
            icon="i-heroicons-exclamation-triangle"
            color="warning"
            variant="soft"
            title="Plugins and mods don't carry over"
            description="Files only the old variant can load (its plugins/mods and loader files) are removed, and world features added by mods stop working. Everything is backed up first, so the old setup stays restorable from the Backups tab. The server starts after the migration to install the new software."
          />

          <p class="text-sm">
            Type
            <span class="font-mono font-semibold">{{ server.name }}</span>
            to confirm.
          </p>
          <UInput
            v-model="migrateConfirmName"
            class="w-full"
            :placeholder="server.name"
            autocomplete="off"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="migrating"
            @click="migrateOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="error"
            :disabled="!migrateTarget || migrateConfirmName !== server.name"
            :loading="migrating"
            @click="runMigrate"
          >
            {{
              migrateTarget
                ? `Migrate to ${variantName(migrateTarget)}`
                : "Migrate"
            }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import vanilla from "~/assets/vanilla.webp";
import paper from "~/assets/paper.svg";
import fabric from "~/assets/fabric.png";
import forge from "~/assets/forge.svg";

const { id, server } = useServerDetail();
const router = useRouter();
const toast = useToast();

// --- General (name / domain) --------------------------------------------------

const general = reactive({
  name: "",
  subdomain: "",
  domain: "",
  hostPort: null as number | null,
});

function resetGeneral() {
  const config = server.value?.config;
  general.name = config?.name ?? server.value?.name ?? "";
  general.subdomain = config?.subdomain ?? "";
  general.domain = config?.domain ?? "";
  general.hostPort = config?.hostPort ?? null;
}

// A cleared number input yields "" (not null), which the server's schema
// rejects — coerce anything non-numeric back to null.
const hostPort = computed({
  get: () => general.hostPort,
  set(value: number | string | null) {
    general.hostPort = typeof value === "number" ? value : null;
  },
});

watch(server, resetGeneral, { immediate: true });

const generalDirty = computed(() => {
  const config = server.value?.config;
  if (!config) return false;
  return (
    general.name !== (config.name ?? "") ||
    general.subdomain !== (config.subdomain ?? "") ||
    general.domain !== (config.domain ?? "") ||
    general.hostPort !== (config.hostPort ?? null)
  );
});

const { data: domains } = useFetch<string[]>("/api/domains", {
  default: () => [],
});

const domainOptions = computed(() =>
  domains.value.map((domain) => ({ label: `.${domain}`, value: domain }))
);

const saving = ref(false);

async function saveGeneral() {
  const config = server.value?.config;
  if (!config) return;
  saving.value = true;
  try {
    const result = await $fetch<{ id: string }>(`/api/server/${id.value}`, {
      method: "PUT",
      body: {
        ...config,
        name: general.name,
        subdomain: general.subdomain || null,
        domain: general.domain,
        hostPort: general.hostPort,
      },
    });

    toast.add({ title: "Server updated", color: "success" });
    await refreshNuxtData("servers");
    await router.replace(`/server/${result.id}/settings`);
  } catch {
    toast.add({
      title: "Error",
      description: "Failed to update the server.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}

// --- Danger zone: variant migration ----------------------------------------------

/**
 * Variants a server can migrate to. Modpack types are not offered — see the
 * matching MIGRATION_TARGETS list in the variant endpoint.
 */
const VARIANTS = [
  {
    value: "VANILLA",
    name: "Vanilla",
    icon: vanilla,
    description: "Plain Minecraft, no plugins or mods.",
  },
  {
    value: "PAPER",
    name: "Paper",
    icon: paper,
    description: "High-performance server with plugin support.",
  },
  {
    value: "FABRIC",
    name: "Fabric",
    icon: fabric,
    description: "Modular, lightweight mod loader.",
  },
  {
    value: "FORGE",
    name: "Forge",
    icon: forge,
    description: "The classic mod loader.",
  },
];

const migrateOpen = ref(false);
const migrating = ref(false);
const migrateTarget = ref<string | null>(null);
const migrateConfirmName = ref("");

const variantOptions = computed(() =>
  VARIANTS.filter((variant) => variant.value !== server.value?.config?.type)
);

function variantName(value: string) {
  return VARIANTS.find((variant) => variant.value === value)?.name ?? value;
}

const currentVariantName = computed(() =>
  variantName(server.value?.config?.type ?? "")
);

function openMigrate() {
  migrateTarget.value = null;
  migrateConfirmName.value = "";
  migrateOpen.value = true;
}

async function runMigrate() {
  if (!migrateTarget.value) return;
  migrating.value = true;
  try {
    const result = await $fetch<{ id: string; backupId: number }>(
      `/api/server/${id.value}/variant`,
      { method: "POST", body: { type: migrateTarget.value } }
    );

    toast.add({
      title: "Server variant changed",
      description: `The server is starting as ${variantName(migrateTarget.value)}. The previous setup was saved as a backup.`,
      color: "success",
    });

    migrateOpen.value = false;
    await refreshNuxtData("servers");
    await router.replace(`/server/${result.id}/settings`);
  } catch (error) {
    toast.add({
      title: "Error",
      description: errorMessage(error, "Failed to change the server variant."),
      color: "error",
    });
  } finally {
    migrating.value = false;
  }
}

// --- Danger zone ----------------------------------------------------------------

const deleteOpen = ref(false);
const deleteWithVolume = ref(false);
const deleting = ref(false);
const confirmName = ref("");

function openDelete(withVolume: boolean) {
  deleteWithVolume.value = withVolume;
  confirmName.value = "";
  deleteOpen.value = true;
}

async function runDelete() {
  deleting.value = true;
  try {
    await $fetch(`/api/server/${id.value}`, {
      method: "DELETE",
      query: { removeVolume: deleteWithVolume.value ? "true" : "false" },
    });

    toast.add({
      title: "Server deleted",
      description: deleteWithVolume.value
        ? "The server and its world are gone."
        : "The server was removed; the world volume is kept.",
      color: "success",
    });

    deleteOpen.value = false;
    await refreshNuxtData("servers");
    await navigateTo("/");
  } catch {
    toast.add({
      title: "Error",
      description: "Failed to delete the server.",
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
}
</script>
