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

    <!-- BlueMap is a plugin/mod, so it only applies to mod-capable types. -->
    <template v-if="bluemapSupported">
      <UFormField name="BLUEMAP" label="BlueMap (3D web map)">
        <div class="flex items-center gap-2">
          <UCheckbox v-model="form.BLUEMAP" />
          <span class="text-sm text-muted">
            Auto-install the BlueMap mod/plugin and serve a 3D web map of the
            world.
          </span>
        </div>
      </UFormField>

      <UFormField
        v-if="form.BLUEMAP"
        name="BLUEMAP_PORT"
        label="BlueMap Web Port"
        help="Host port the map is published on (must be unique per server). After the first start, set accept-download: true in bluemap/core.conf so BlueMap can fetch Mojang assets."
      >
        <UInput
          v-model.number="form.BLUEMAP_PORT"
          type="number"
          placeholder="8100"
          autocomplete="off"
          class="w-full"
        />
      </UFormField>
    </template>
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

const bluemapSupported = computed(() =>
  ["PAPER", "FABRIC", "FORGE"].includes(form.value.type ?? "")
);
</script>
