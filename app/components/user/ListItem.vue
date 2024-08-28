<template>
  <UButton
    icon="i-heroicons-x-mark"
    variant="solid"
    color="white"
    size="lg"
    @click="emit('remove', player)"
    :ui="{ base: 'w-full' }"
  >
    <template #leading>
      <UAvatar
        :src="`/api/minecraft/${player.username}/skin`"
        :alt="`Minecraft Avatar of ${player.username}`"
        size="xs"
        :ui="{ rounded: 'rounded-sm' }"
      />
    </template>
    {{ player.username }}

    <template #trailing>
      <UButton
        class="ml-auto"
        icon="i-heroicons-x-mark"
        variant="link"
        color="red"
        :padded="false"
      />
    </template>
  </UButton>
</template>

<script lang="ts" setup>
defineProps<{
  player: { id: string; username: string };
}>();

const emit = defineEmits(["update", "remove"]);
</script>

<style></style>
