<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-heroicons-user-circle"
      :label="user?.name"
      trailing-icon="i-heroicons-chevron-down-20-solid"
    />
  </UDropdownMenu>

  <AuthPasskeysModal v-model:open="passkeysOpen" />
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const { user, clear } = useUserSession();
const passkeysOpen = ref(false);

const items = computed<DropdownMenuItem[]>(() => [
  {
    label: user.value?.email ?? "",
    type: "label",
  },
  {
    label: "Passkeys",
    icon: "i-heroicons-finger-print",
    onSelect: () => {
      passkeysOpen.value = true;
    },
  },
  {
    label: "Sign out",
    icon: "i-heroicons-arrow-right-start-on-rectangle",
    onSelect: signOut,
  },
]);

async function signOut() {
  await clear();
  await navigateTo("/login");
}
</script>
