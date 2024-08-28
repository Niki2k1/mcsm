<template>
  <UDashboardPanelContent class="pb-24">
    <UForm
      :state="form"
      :validate="validate"
      :validate-on="['submit']"
      @submit="onSubmit"
    >
      <UDashboardSection title="Server">
        <UFormGroup
          name="name"
          label="Name"
          required
          class="grid grid-cols-2 gap-2"
          :ui="{ container: '' }"
        >
          <UInput
            v-model="form.name"
            placeholder="My Awesome Server"
            type="text"
            autocomplete="off"
            size="md"
          >
          </UInput>
        </UFormGroup>

        <UFormGroup
          name="domain"
          label="Domain"
          required
          class="grid grid-cols-2 gap-2"
          :ui="{ container: '' }"
        >
          <UInput
            v-model="form.domain"
            type="text"
            placeholder="my-awesome-server"
            autocomplete="off"
            size="md"
          >
            <template #trailing>
              <span class="text-gray-500 dark:text-gray-400 text-sm"
                >.niki2k1.dev</span
              >
            </template>
          </UInput>
        </UFormGroup>

        <UFormGroup
          name="version"
          label="Version"
          required
          class="grid grid-cols-2 gap-2"
          :ui="{ container: '' }"
        >
          <USelectMenu v-model="form.version" :options="versionOptions" />
        </UFormGroup>

        <UFormGroup
          name="memory"
          label="Memory"
          required
          class="grid grid-cols-2 gap-2"
          :ui="{ container: '' }"
        >
          <UTabs v-model="form.memory" :items="memoryOptions" />
        </UFormGroup>
      </UDashboardSection>
    </UForm>
  </UDashboardPanelContent>
</template>

<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "#ui/types";

const form = defineModel<Record<string, string>>("form");

const { data: versionOptions } = useFetch("/api/minecraft/versions", {
  default: () => [],
});

const memoryOptions = [
  { label: "2 GB", value: 2048, icon: "i-heroicons-user-16-solid" },
  { label: "4 GB", value: 4096, icon: "i-heroicons-users-16-solid" },
  { label: "8 GB", value: 8192, icon: "i-heroicons-user-group-16-solid" },
];

const toast = useToast();

function validate(state: any): FormError[] {
  const errors = [];
  if (!state.name)
    errors.push({ path: "name", message: "Please enter your name." });
  if (!state.email)
    errors.push({ path: "email", message: "Please enter your email." });
  if (
    (state.password_current && !state.password_new) ||
    (!state.password_current && state.password_new)
  )
    errors.push({
      path: "password",
      message: "Please enter a valid password.",
    });
  return errors;
}

async function onSubmit(event: FormSubmitEvent<any>) {
  // Do something with data
  console.log(event.data);

  toast.add({ title: "Profile updated", icon: "i-heroicons-check-circle" });
}
</script>
