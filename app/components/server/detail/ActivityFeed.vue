<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Activity</h3>
        <UButton
          icon="i-heroicons-arrow-path-20-solid"
          variant="ghost"
          color="neutral"
          size="xs"
          aria-label="Refresh activity"
          :loading="status === 'pending'"
          @click="refresh()"
        />
      </div>
    </template>

    <div
      v-if="!events?.length"
      class="text-sm text-muted py-6 text-center space-y-2"
    >
      <UIcon
        name="i-heroicons-clock"
        class="size-6 mx-auto opacity-60"
      />
      <p>No activity recorded yet.</p>
    </div>

    <ol v-else class="space-y-4">
      <li
        v-for="event in events"
        :key="event.id"
        class="flex gap-3 items-start"
      >
        <span
          class="rounded-full p-1.5 ring-1 ring-default shrink-0"
          :class="styleFor(event.action).bg"
        >
          <UIcon
            :name="styleFor(event.action).icon"
            class="size-4 block"
            :class="styleFor(event.action).text"
          />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-sm">
            {{ styleFor(event.action).label }}
            <span v-if="event.detail" class="text-muted">
              — {{ event.detail }}</span
            >
          </p>
          <p class="text-xs text-muted">
            {{ timeAgo(event.t) }}
          </p>
        </div>
      </li>
    </ol>
  </UCard>
</template>

<script setup lang="ts">
import type { ActivityEvent } from "~/composables/server-detail";
import { timeAgo } from "~/utils/time";

const { id } = useServerDetail();

const {
  data: events,
  refresh,
  status,
} = useFetch<ActivityEvent[]>(() => `/api/server/${id.value}/activity`, {
  default: () => [],
});

const STYLES: Record<
  string,
  { label: string; icon: string; bg: string; text: string }
> = {
  created: {
    label: "Server created",
    icon: "i-heroicons-sparkles-20-solid",
    bg: "bg-primary/10",
    text: "text-primary",
  },
  started: {
    label: "Server started",
    icon: "i-heroicons-play-20-solid",
    bg: "bg-success/10",
    text: "text-success",
  },
  stopped: {
    label: "Server stopped",
    icon: "i-heroicons-stop-20-solid",
    bg: "bg-warning/10",
    text: "text-warning",
  },
  restarted: {
    label: "Server restarted",
    icon: "i-heroicons-arrow-path-20-solid",
    bg: "bg-info/10",
    text: "text-info",
  },
  edited: {
    label: "Configuration changed",
    icon: "i-heroicons-pencil-square-20-solid",
    bg: "bg-info/10",
    text: "text-info",
  },
  deleted: {
    label: "Server deleted",
    icon: "i-heroicons-trash-20-solid",
    bg: "bg-error/10",
    text: "text-error",
  },
  "backup-created": {
    label: "Backup created",
    icon: "i-heroicons-archive-box-20-solid",
    bg: "bg-primary/10",
    text: "text-primary",
  },
  "backup-restored": {
    label: "Backup restored",
    icon: "i-heroicons-archive-box-arrow-down-20-solid",
    bg: "bg-warning/10",
    text: "text-warning",
  },
  "backup-deleted": {
    label: "Backup deleted",
    icon: "i-heroicons-trash-20-solid",
    bg: "bg-error/10",
    text: "text-error",
  },
  "pregen-started": {
    label: "Pre-generation started",
    icon: "i-heroicons-globe-alt-20-solid",
    bg: "bg-primary/10",
    text: "text-primary",
  },
  "pregen-completed": {
    label: "Pre-generation completed",
    icon: "i-heroicons-check-circle-20-solid",
    bg: "bg-success/10",
    text: "text-success",
  },
  "pregen-cancelled": {
    label: "Pre-generation cancelled",
    icon: "i-heroicons-x-circle-20-solid",
    bg: "bg-warning/10",
    text: "text-warning",
  },
  "jars-uploaded": {
    label: "Add-ons uploaded",
    icon: "i-heroicons-puzzle-piece-20-solid",
    bg: "bg-primary/10",
    text: "text-primary",
  },
  "jar-deleted": {
    label: "Add-on deleted",
    icon: "i-heroicons-trash-20-solid",
    bg: "bg-error/10",
    text: "text-error",
  },
  "config-edited": {
    label: "Config file edited",
    icon: "i-heroicons-pencil-square-20-solid",
    bg: "bg-info/10",
    text: "text-info",
  },
};

const FALLBACK_STYLE = {
  label: "Event",
  icon: "i-heroicons-information-circle-20-solid",
  bg: "bg-elevated",
  text: "text-muted",
};

function styleFor(action: string) {
  return STYLES[action] ?? FALLBACK_STYLE;
}
</script>
