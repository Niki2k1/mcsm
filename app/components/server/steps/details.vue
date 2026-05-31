<template>
  <div class="space-y-4">
    <UFormField name="name" label="Name" required>
      <UInput
        v-model="form.name"
        placeholder="My Awesome Server"
        autocomplete="off"
        class="w-full"
      />
    </UFormField>

    <UFormField name="domain" label="Domain" required>
      <div class="grid grid-cols-3 gap-2">
        <UInput
          v-model="subDomain"
          class="col-span-2"
          placeholder="my-awesome-server"
          autocomplete="off"
        />
        <USelectMenu
          v-model="form.domain"
          :items="domainOptions"
          value-key="value"
          placeholder="Domain"
        />
      </div>
    </UFormField>

    <UFormField name="memory" label="Memory" required>
      <UTabs v-model="form.memory" :items="memoryOptions" :content="false" />
    </UFormField>
  </div>
</template>

<script setup lang="ts">
const form = useCreateForm();

const { data: domains } = useFetch<string[]>("/api/domains", {
  default: () => [],
});

const domainOptions = computed(() =>
  domains.value.map((domain) => ({
    label: `.${domain}`,
    value: domain,
  }))
);

watch(domains, (domains) => {
  if (!form.value) return;
  if (!form.value.domain) form.value.domain = domains[0] ?? "";
});

const memoryOptions = [
  { label: "2GB", value: "2GB", icon: "i-heroicons-user-16-solid" },
  { label: "4GB", value: "4GB", icon: "i-heroicons-users-16-solid" },
  { label: "8GB", value: "8GB", icon: "i-heroicons-user-group-16-solid" },
];

const subDomain = computed({
  get() {
    if (!form.value.subdomain || form.value.subdomain === "") {
      return (form.value.name ?? "").toLocaleLowerCase().replaceAll(" ", "-");
    }
    return form.value.subdomain;
  },
  set(value) {
    form.value.subdomain = value;
  },
});
</script>
