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

    <UFormField
      name="JAVA_VERSION"
      label="Java version"
      help="Old Minecraft versions and modpacks need old Java: ≤1.16 → Java 8, 1.17–1.20.4 → Java 17, newer → latest."
    >
      <USelectMenu
        v-model="form.JAVA_VERSION"
        :items="javaOptions"
        value-key="value"
        class="w-full"
      />
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

const javaOptions = [
  { label: "Latest (recommended)", value: "latest" },
  { label: "Java 21 — MC 1.20.5+", value: "java21" },
  { label: "Java 17 — MC 1.17 – 1.20.4", value: "java17" },
  { label: "Java 11 — legacy", value: "java11" },
  { label: "Java 8 — MC ≤1.16 / old modpacks", value: "java8-multiarch" },
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
