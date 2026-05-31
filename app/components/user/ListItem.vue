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
        :src="`/api/minecraft/${player.name}/skin`"
        :alt="`Minecraft Avatar of ${player.name}`"
        size="2xs"
      />
    </template>

    {{ player.name }}

    <UIcon name="i-heroicons-x-mark" class="ml-auto" />
  </UButton>
</template>

<script lang="ts" setup>
defineProps<{
  player: { name: string; uuid: string };
}>();

const emit = defineEmits(["update", "remove"]);
</script>
