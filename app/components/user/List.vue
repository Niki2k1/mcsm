<template>
  <div class="px-4 py-5 sm:p-6 !p-1 w-80">
    <h3 class="text-lg font-bold py-2" v-if="title">{{ title }}</h3>
    <nav class="relative">
      <ul class="flex flex-col gap-2">
        <li v-for="player in players" :key="player.id">
          <UserListItem :player @remove="remove" />
        </li>
        <li>
          <UInput
            v-model.trim="newPlayer"
            placeholder="Spieler hinzufügen"
            autocomplete="off"
            :ui="{ icon: { trailing: { pointer: '' } } }"
            @keyup.enter="addPlayer"
            size="lg"
          >
            <template #trailing>
              <UButton
                color="gray"
                variant="link"
                icon="i-heroicons-arrow-turn-down-left-16-solid"
                :padded="false"
                @click="addPlayer"
              />
            </template>
          </UInput>
        </li>
      </ul>
    </nav>
  </div>
</template>

<script lang="ts" setup>
const toast = useToast();

defineProps<{
  title?: string;
}>();

const players = defineModel<{ id: string; username: string }[]>({
  default: [],
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
      color: "red",
    });
  }
}

async function remove({ id }: { id: string }) {
  players.value = players.value.filter((player) => player.id !== id);
}
</script>

<style></style>
