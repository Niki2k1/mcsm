<template>
  <div v-if="normalized.length" class="flex flex-wrap gap-2">
    <UBadge
      v-for="player in normalized"
      :key="player.id"
      color="gray"
      variant="subtle"
      class="gap-1.5 pl-1"
    >
      <UAvatar
        :src="`/api/minecraft/${player.username}/skin`"
        :alt="`Minecraft Avatar of ${player.username}`"
        size="3xs"
        :ui="{ rounded: 'rounded-sm' }"
      />
      {{ player.username }}
    </UBadge>
  </div>
  <span v-else class="text-gray-500 dark:text-gray-400">None</span>
</template>

<script setup lang="ts">
const props = defineProps<{
  players: { id?: string; username?: string; name?: string; uuid?: string }[];
}>();

// The player list stores items as { id, username }, while the create-form type
// describes them as { name, uuid }. Normalize so either shape renders.
const normalized = computed(() =>
  (props.players ?? []).map((player) => ({
    id: player.id ?? player.uuid ?? player.username ?? player.name ?? "",
    username: player.username ?? player.name ?? "",
  }))
);
</script>
