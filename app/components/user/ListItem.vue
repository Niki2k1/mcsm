<template>
  <UButton
    color="neutral"
    variant="soft"
    block
    class="justify-start"
    @click="emit('remove', player)"
  >
    <template #leading>
      <UAvatar
        :src="`/api/minecraft/${player.username}/skin`"
        :alt="`Minecraft Avatar of ${player.username}`"
        size="2xs"
      />
    </template>

    {{ player.username }}

    <UIcon name="i-heroicons-x-mark" class="ml-auto" />
  </UButton>
</template>

<script lang="ts" setup>
defineProps<{
  player: { id: string; username: string };
}>();

const emit = defineEmits(["update", "remove"]);
</script>
