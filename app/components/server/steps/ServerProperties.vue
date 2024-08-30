<template>
  <UDashboardPanelContent class="pb-24">
    <UForm
      :state="form"
      :validate="validate"
      :validate-on="['submit']"
      @submit="onSubmit"
    >
      <UDashboardSection title="Server Properties">
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

          <UCheckbox
            v-if="field.type === 'checkbox'"
            v-model="form[field.name]"
          />

          <USelectMenu
            v-if="field.type === 'select'"
            v-model="form[field.name]"
            :options="field.options"
            value-attribute="value"
            option-attribute="label"
          />

          <UserList
            v-if="field.type === 'user-list'"
            v-model="form[field.name]"
          />

          <Motd v-if="field.name === 'MOTD'" :motd="form[field.name]" />
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
    name: "LEVEL",
    label: "World Name",
    type: "text",
    required: true,
    placeholder: "world",
  },
  {
    name: "DIFFICULTY",
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
    name: "HARDCORE",
    label: "Hardcore",
    type: "checkbox",
    required: false,
  },
  {
    name: "MAX_PLAYERS",
    label: "Max Players",
    type: "number",
    placeholder: "20",
    required: true,
  },
  {
    name: "operators",
    label: "Operators",
    type: "user-list",
    required: false,
  },
  {
    name: "whitelist",
    label: "Whitelist",
    type: "user-list",
    required: false,
  },
  {
    name: "ONLINE_MODE",
    label: "Online Mode",
    type: "checkbox",
    required: false,
  },
  {
    name: "ALLOW_FLIGHT",
    label: "Allow Flight",
    type: "checkbox",
    required: false,
  },
]);

const form = useCreateForm();

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
