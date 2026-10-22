<template>
  <UContainer>
    <UPage>
      <UPageHeader
        headline="Status"
        title="Overview"
        description="Check the status of your servers."
      >
        <template v-if="user?.admin" #links>
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
          <p v-if="user?.admin">
            No servers yet. Create your first one to get started.
          </p>
          <p v-else>
            You don't have access to any servers yet. Ask an admin to share one
            with you.
          </p>
          <UButton
            v-if="user?.admin"
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
            @start="setRunning($event.id, true)"
            @stop="setRunning($event.id, false)"
          />
        </UPageGrid>
      </UPageBody>
    </UPage>
  </UContainer>
</template>

<script setup lang="ts">
type Server = {
  id: string;
  name: string;
  domain: string;
  type: string | null;
  running: boolean;
  /** Stored config — the card uses ICON for its icon fallback. */
  config?: { ICON?: string | null; BLUEMAP?: boolean } | null;
  /** World volume name — used for the card's BlueMap link. */
  volume?: string | null;
  access?: ServerAccessLevel;
};

const { user } = useUserSession();

const serverModal = useServerModal();
const toast = useToast();

const { data: servers } = await useFetch<Server[]>("/api/server", {
  key: "servers",
  default: () => [],
});

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
      description: errorMessage(
        error,
        `Failed to ${running ? "start" : "stop"} server.`
      ),
      color: "error",
    });
  }
}
</script>
