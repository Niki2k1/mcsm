<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h2 class="font-semibold">System</h2>
          <p class="text-sm text-muted">Docker connectivity and server counts.</p>
        </div>
        <UButton
          icon="i-heroicons-arrow-path"
          color="neutral"
          variant="ghost"
          size="xs"
          :loading="status === 'pending'"
          aria-label="Refresh"
          @click="() => refresh()"
        />
      </div>
    </template>

    <div class="grid gap-4 sm:grid-cols-3">
      <div class="flex items-center gap-3">
        <UIcon
          :name="data?.dockerOk ? 'i-heroicons-check-circle-20-solid' : 'i-heroicons-x-circle-20-solid'"
          class="size-7 shrink-0"
          :class="data?.dockerOk ? 'text-success' : 'text-error'"
        />
        <div>
          <p class="text-sm text-muted">Docker</p>
          <p class="font-medium">
            {{ data?.dockerOk ? "Connected" : "Unreachable" }}
            <span v-if="data?.version" class="text-muted font-normal">
              · v{{ data.version }}
            </span>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-server-stack-20-solid" class="size-7 shrink-0 text-muted" />
        <div>
          <p class="text-sm text-muted">Servers</p>
          <p class="font-medium">{{ data?.servers ?? 0 }}</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-play-circle-20-solid" class="size-7 shrink-0 text-success" />
        <div>
          <p class="text-sm text-muted">Running</p>
          <p class="font-medium">{{ data?.running ?? 0 }}</p>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface Status {
  dockerOk: boolean;
  version?: string;
  servers: number;
  running: number;
}

const { data, status, refresh } = useFetch<Status>("/api/admin/status", {
  key: "admin-status",
});
</script>
