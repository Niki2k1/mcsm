<template>
  <UContainer>
    <UPage>
      <UPageHeader
        headline="Status"
        title="Overview"
        description="Check the status of your servers."
      >
        <template #links>
          <UButton
            icon="i-heroicons-plus-20-solid"
            @click="serverModal.openCreate()"
          >
            New Server
          </UButton>
        </template>
      </UPageHeader>

      <UPageBody>
        <div
          v-if="!servers?.length"
          class="text-center py-16 text-muted space-y-4"
        >
          <UIcon
            name="i-heroicons-server-stack"
            class="size-10 mx-auto opacity-60"
          />
          <p>No servers yet. Create your first one to get started.</p>
          <UButton
            icon="i-heroicons-plus-20-solid"
            @click="serverModal.openCreate()"
          >
            Create Server
          </UButton>
        </div>

        <UPageGrid v-else>
          <ServerCard
            v-for="server in servers"
            :key="server.id"
            :server="server"
            :bluemap-host="bluemapHost"
            @edit="serverModal.openEdit"
            @delete="confirmDelete"
            @start="setRunning($event.id, true)"
            @stop="setRunning($event.id, false)"
            @console="consoleModal.open"
          />
        </UPageGrid>
      </UPageBody>
    </UPage>

    <!-- Delete confirmation -->
    <UModal
      v-model:open="deleteOpen"
      title="Delete server"
      :description="`Remove “${pendingDelete?.name}”? The world volume is kept and can be recovered.`"
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
  </UContainer>
</template>

<script setup lang="ts">
type Server = {
  id: string;
  name: string;
  domain: string;
  type: string | null;
  running: boolean;
  config?: { BLUEMAP?: boolean; BLUEMAP_PORT?: number } | null;
};

const serverModal = useServerModal();
const consoleModal = useConsoleModal();
const toast = useToast();

const { data: servers } = await useFetch<Server[]>("/api/server", {
  key: "servers",
  default: () => [],
});

// Global BlueMap map-link host (overrides the dashboard origin when set).
const { data: settings } = useFetch<{ bluemap?: { publicHost?: string } }>(
  "/api/admin/settings",
  { key: "admin-settings", default: () => ({}) }
);
const bluemapHost = computed(() => settings.value?.bluemap?.publicHost ?? "");

const deleteOpen = ref(false);
const deleting = ref(false);
const pendingDelete = ref<{ id: string; name: string } | null>(null);

function confirmDelete(server: { id: string; name: string }) {
  pendingDelete.value = server;
  deleteOpen.value = true;
}

async function setRunning(id: string, running: boolean) {
  try {
    await $fetch(`/api/server/${id}/${running ? "start" : "stop"}`, {
      method: "POST",
    });
    toast.add({
      title: running ? "Server starting" : "Server stopping",
      color: "success",
    });
    await refreshNuxtData("servers");
  } catch (error) {
    toast.add({
      title: "Error",
      description: `Failed to ${running ? "start" : "stop"} server.`,
      color: "error",
    });
  }
}

async function runDelete() {
  if (!pendingDelete.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/server/${pendingDelete.value.id}`, { method: "DELETE" });
    toast.add({ title: "Server deleted", color: "success" });
    deleteOpen.value = false;
    await refreshNuxtData("servers");
  } catch (error) {
    toast.add({
      title: "Error",
      description: "Failed to delete server.",
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
}
</script>
