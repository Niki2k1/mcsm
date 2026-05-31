<template>
  <div class="space-y-4">
    <UFormField
      v-for="field in formFields"
      :key="field.name"
      :name="field.name"
      :label="field.label"
      :required="field.required"
    >
      <MotdEditor v-if="field.name === 'MOTD'" v-model="form.MOTD" />

      <UInput
        v-else-if="field.type === 'text'"
        v-model="form[field.name]"
        :placeholder="field.placeholder"
        autocomplete="off"
        class="w-full"
      />

      <UInput
        v-else-if="field.type === 'number'"
        v-model.number="form[field.name]"
        type="number"
        :placeholder="field.placeholder"
        autocomplete="off"
        class="w-full"
      />

      <UCheckbox
        v-else-if="field.type === 'checkbox'"
        v-model="form[field.name]"
      />

      <USelectMenu
        v-else-if="field.type === 'select'"
        v-model="form[field.name]"
        :items="field.options"
        value-key="value"
        class="w-full"
      />

      <UserList
        v-else-if="field.type === 'user-list'"
        v-model="form[field.name]"
      />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
import MotdEditor from "~/components/server/motd/MotdEditor.vue";

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
</script>
