<template>
  <AuthShell
    title="Welcome to MCSM"
    description="Create the admin account to get started. You can add more users later from the Admin panel."
    wide
  >
    <form class="flex w-full flex-col gap-3" @submit.prevent="createAdmin">
      <UAlert
        v-if="formError"
        icon="i-heroicons-exclamation-triangle"
        color="error"
        variant="soft"
        :description="formError"
      />

      <UFormField label="Name">
        <UInput
          v-model="name"
          placeholder="Steve"
          autocomplete="name"
          autofocus
          class="w-full"
        />
      </UFormField>

      <UFormField label="Email">
        <UInput
          v-model="email"
          type="email"
          placeholder="you@example.com"
          autocomplete="username"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Password" help="At least 8 characters.">
        <UInput
          v-model="password"
          type="password"
          placeholder="••••••••"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Confirm password">
        <UInput
          v-model="passwordConfirm"
          type="password"
          placeholder="••••••••"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>

      <UButton type="submit" block :loading="creating" :disabled="!valid">
        Create admin account
      </UButton>
    </form>
  </AuthShell>
</template>

<script setup lang="ts">
import { errorMessage } from "~/utils/errors";

definePageMeta({ layout: false });

useSeoMeta({ title: "Setup · Minecraft Server Manager" });

const { fetch: refreshSession } = useUserSession();

const name = ref("");
const email = ref("");
const password = ref("");
const passwordConfirm = ref("");
const creating = ref(false);
const formError = ref("");

const valid = computed(
  () =>
    name.value.trim() &&
    email.value.trim() &&
    password.value.length >= 8 &&
    password.value === passwordConfirm.value
);

async function createAdmin() {
  if (password.value !== passwordConfirm.value) {
    formError.value = "Passwords do not match.";
    return;
  }

  creating.value = true;
  formError.value = "";
  try {
    await $fetch("/api/auth/setup", {
      method: "POST",
      body: {
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
      },
    });
    // Setup logs the new admin in right away.
    await refreshSession();
    needsSetupState().value = false;
    await navigateTo("/");
  } catch (error) {
    formError.value = errorMessage(error, "Could not create the account.");
  } finally {
    creating.value = false;
  }
}
</script>
