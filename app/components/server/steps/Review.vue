<template>
  <UDashboardPanelContent class="pb-24">
    <UDashboardSection title="Review">
      {{ form }}

      <UButton @click="createServer"> Create Server </UButton>
    </UDashboardSection>
  </UDashboardPanelContent>
</template>

<script setup lang="ts">
const loading = ref(false);

const form = useCreateForm();

const toast = useToast();

async function createServer() {
  loading.value = true;

  try {
    await $fetch("/api/server/create", {
      method: "POST",
      body: form.value,
    });

    toast.add({
      title: "Server Created",
      description: "Your server has been created",
      color: "green",
    });
  } catch (error) {
    toast.add({
      title: "Error",
      description: "Failed to create server",
      color: "red",
    });
  } finally {
    loading.value = false;
  }
}
</script>
