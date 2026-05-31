<template>
  <div class="w-full max-w-sm">
    <h3 class="text-lg font-bold py-2" v-if="title">{{ title }}</h3>
    <ul class="flex flex-col gap-2">
      <li v-for="player in players" :key="player.id">
        <UserListItem :player="player" @remove="remove" />
      </li>
      <li>
        <UInput
          v-model.trim="newPlayer"
          placeholder="Add player"
          autocomplete="off"
          class="w-full"
          @keyup.enter="addPlayer"
        >
          <template #trailing>
            <UButton
              color="neutral"
              variant="link"
              icon="i-heroicons-arrow-turn-down-left-16-solid"
              @click="addPlayer"
            />
          </template>
        </UInput>
      </li>
    </ul>
  </div>
</template>

<script lang="ts" setup>
const toast = useToast();

defineProps<{
  title?: string;
}>();

const players = defineModel<{ id: string; username: string }[]>({
  default: () => [],
});

const newPlayer = ref("");

async function addPlayer() {
  try {
    if (newPlayer.value === "") return;

    const profile = await $fetch<MinecraftProfile>(
      `/api/minecraft/${newPlayer.value}/profile`
    );

    players.value.push({ id: profile.id, username: profile.name });
    newPlayer.value = "";
  } catch (error) {
    toast.add({
      title: "Error",
      description: "Player not found",
      color: "error",
    });
  }
}

async function remove({ id }: { id: string }) {
  players.value = players.value.filter((player) => player.id !== id);
}
</script>
