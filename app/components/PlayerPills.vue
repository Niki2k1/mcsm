<template>
  <div v-if="players.length" class="flex flex-wrap gap-2">
    <UBadge
      v-for="player in players"
      :key="player.uuid"
      color="neutral"
      variant="subtle"
      class="gap-1.5 pl-1"
    >
      <UAvatar
        :src="`/api/minecraft/${player.name}/skin`"
        :alt="`Minecraft Avatar of ${player.name}`"
        size="3xs"
      />
      {{ player.name }}
    </UBadge>
  </div>
  <span v-else class="text-muted">None</span>
</template>

<script setup lang="ts">
defineProps<{
  players: { name: string; uuid: string }[];
}>();
</script>
