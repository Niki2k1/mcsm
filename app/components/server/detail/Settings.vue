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
  </div>
</template>

<script setup lang="ts">
const { id, server } = useServerDetail();
const router = useRouter();
const toast = useToast();

// --- General (name / domain) --------------------------------------------------

const general = reactive({ name: "", subdomain: "", domain: "" });

function resetGeneral() {
  const config = server.value?.config;
  general.name = config?.name ?? server.value?.name ?? "";
  general.subdomain = config?.subdomain ?? "";
  general.domain = config?.domain ?? "";
}

watch(server, resetGeneral, { immediate: true });

const generalDirty = computed(() => {
  const config = server.value?.config;
  if (!config) return false;
  return (
    general.name !== (config.name ?? "") ||
    general.subdomain !== (config.subdomain ?? "") ||
    general.domain !== (config.domain ?? "")
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
