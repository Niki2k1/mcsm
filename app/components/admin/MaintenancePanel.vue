<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Maintenance</h2>
      <p class="text-sm text-muted">
        Push global settings to servers that already exist.
      </p>
    </template>

    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="font-medium">Re-apply to all servers</p>
        <p class="text-sm text-muted">
          Recreates every managed server from its saved config plus the current
          secrets. Worlds are preserved; each server restarts briefly.
        </p>
      </div>
      <UButton
        color="warning"
        icon="i-heroicons-arrow-path"
        class="shrink-0"
        @click="confirmOpen = true"
      >
        Re-apply
      </UButton>
    </div>

    <UModal v-model:open="confirmOpen" title="Re-apply to all servers">
      <template #body>
        <p class="text-sm">
          This recreates every managed server with the latest global settings.
          Worlds are kept, but <span class="font-medium">each server will
          briefly go offline</span> while it restarts.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="confirmOpen = false">
            Cancel
          </UButton>
          <UButton color="warning" :loading="running" @click="reapply">
            Re-apply now
          </UButton>
        </div>
      </template>
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
interface ReapplyResult {
  total: number;
  applied: number;
  failed: Array<{ name: string; error: string }>;
}

const toast = useToast();
const confirmOpen = ref(false);
const running = ref(false);

async function reapply() {
  running.value = true;
  try {
    const result = await $fetch<ReapplyResult>("/api/admin/reapply", {
      method: "POST",
    });
    confirmOpen.value = false;
    await refreshNuxtData("servers");

    if (result.failed.length) {
      toast.add({
        title: `Re-applied ${result.applied}/${result.total}`,
        description: `Failed: ${result.failed.map((f) => f.name).join(", ")}`,
        color: "warning",
      });
    } else {
      toast.add({
        title: `Re-applied to ${result.applied} ${result.applied === 1 ? "server" : "servers"}`,
        color: "success",
      });
    }
  } catch (error) {
    toast.add({
      title: "Re-apply failed",
      description: (error as Error).message,
      color: "error",
    });
  } finally {
    running.value = false;
  }
}
</script>
