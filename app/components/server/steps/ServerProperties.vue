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
          v-for="field in formFields"
          :key="field.name"
          :name="field.name"
          :label="field.label"
          :required="field.required"
          class="grid grid-cols-2 gap-2"
          :ui="{ container: '' }"
        >
          <UInput
            v-if="field.type === 'text' || field.type === 'number'"
            v-model="form[field.name]"
            :placeholder="field.placeholder"
            :type="field.type"
            autocomplete="off"
            size="md"
          />

          <USelectMenu
            v-if="field.type === 'select'"
            v-model="form[field.name]"
            :options="field.options"
            value-attribute="value"
            option-attribute="label"
          />
        </UFormGroup>
      </UDashboardSection>
    </UForm>
  </UDashboardPanelContent>
</template>

<script setup lang="ts">
import type { FormError, FormSubmitEvent } from "#ui/types";

const toast = useToast();

const formFields = ref([
  {
    name: "MOTD",
    label: "Message of the Day (MOTD)",
    type: "text",
    required: true,
    placeholder: "Welcome to the §3server!",
  },
  {
    name: "difficulty",
    label: "Difficulty",
    type: "select",
    options: [
      { label: "Peaceful", value: "peaceful" },
      { label: "Easy", value: "easy" },
      { label: "Normal", value: "normal" },
      { label: "Hard", value: "hard" },
    ],
    default: "normal",
    required: true,
  },
  {
    name: "maxPlayers",
    label: "Max Players",
    type: "number",
    placeholder: "20",
    required: true,
  },
]);

const form = defineModel<Record<string, string>>("form", {
  default: {},
});

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
