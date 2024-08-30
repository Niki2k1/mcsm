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
          <div class="grid grid-cols-3 gap-2">
            <UInput
              v-model="subDomain"
              class="col-span-2"
              type="text"
              placeholder="my-awesome-server"
              autocomplete="off"
              size="md"
            />
            <USelectMenu
              v-model="form.domain"
              class="col-span-1"
              :options="domainOptions"
              value-attribute="value"
              option-attribute="label"
              label="Domain"
              placeholder="Select a domain"
              size="md"
            />
          </div>
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

const form = useCreateForm();

const { data: domains } = useFetch<string[]>("/api/domains", {
  default: () => [],
});

const domainOptions = computed(() => {
  return domains.value.map((domain) => ({
    label: `.${domain}`,
    value: domain,
  }));
});

watch(domains, (domains) => {
  if (!form.value) return;
  form.value.domain = domains[0] ?? "";
});

const memoryOptions = [
  { label: "2GB", icon: "i-heroicons-user-16-solid" },
  { label: "4GB", icon: "i-heroicons-users-16-solid" },
  { label: "8GB", icon: "i-heroicons-user-group-16-solid" },
];

const toast = useToast();

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
