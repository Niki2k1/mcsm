<template>
  <UModal
    v-model:open="state.open"
    :title="isEdit ? 'Edit Server' : 'Create Server'"
    :description="
      isEdit
        ? 'Update your server. Saving recreates the container; the world is kept.'
        : 'Configure your new Minecraft server.'
    "
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <UStepper v-model="step" :items="steps">
        <template #type>
          <ServerStepsType />
        </template>
        <template #details>
          <ServerStepsDetails />
        </template>
        <template #properties>
          <ServerStepsServerProperties />
        </template>
        <template #review>
          <ServerStepsReview />
        </template>
      </UStepper>
    </template>

    <template #footer>
      <div class="flex justify-between w-full">
        <UButton
          v-if="step > 0"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-left-20-solid"
          @click="step--"
        >
          Back
        </UButton>
        <div v-else />

        <UButton
          v-if="step < steps.length - 1"
          trailing-icon="i-heroicons-arrow-right-20-solid"
          @click="step++"
        >
          Next
        </UButton>
        <UButton
          v-else
          icon="i-heroicons-rocket-launch-20-solid"
          :loading="loading"
          @click="submit"
        >
          {{ isEdit ? "Save Changes" : "Create Server" }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { state, close } = useServerModal();
const form = useCreateForm();
const toast = useToast();

const steps = [
  {
    title: "Choose Type",
    icon: "i-heroicons-server-20-solid",
    slot: "type" as const,
  },
  {
    title: "Details",
    icon: "i-heroicons-document-text-20-solid",
    slot: "details" as const,
  },
  {
    title: "Server Properties",
    icon: "i-heroicons-cog-6-tooth-20-solid",
    slot: "properties" as const,
  },
  {
    title: "Review",
    icon: "i-heroicons-clipboard-document-check-20-solid",
    slot: "review" as const,
  },
];

const step = ref(0);
const loading = ref(false);

const isEdit = computed(() => state.value.mode === "edit");

// Restart at the first step every time the modal opens.
watch(
  () => state.value.open,
  (open) => {
    if (open) step.value = 0;
  }
);

async function submit() {
  loading.value = true;
  try {
    if (isEdit.value && state.value.serverId) {
      await $fetch(`/api/server/${state.value.serverId}`, {
        method: "PUT",
        body: form.value,
      });
    } else {
      await $fetch("/api/server/create", {
        method: "POST",
        body: form.value,
      });
    }

    toast.add({
      title: isEdit.value ? "Server Updated" : "Server Created",
      description: isEdit.value
        ? "Your changes have been applied."
        : "Your server has been created.",
      color: "success",
    });

    close();
    await refreshNuxtData("servers");
  } catch (error) {
    toast.add({
      title: "Error",
      description: isEdit.value
        ? "Failed to update server."
        : "Failed to create server.",
      color: "error",
    });
  } finally {
    loading.value = false;
  }
}
</script>
