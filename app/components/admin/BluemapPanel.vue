<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">BlueMap</h2>
      <p class="text-sm text-muted">
        Defaults for the
        <ULink to="https://bluemap.bluecolored.de/" target="_blank" class="text-primary">
          BlueMap
        </ULink>
        3D web map. The toggle and port seed the create wizard for new
        Paper/Fabric/Forge servers; the map host is used for the dashboard's
        "Map" links.
      </p>
    </template>

    <div class="space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="font-medium">Enable by default</p>
          <p class="text-sm text-muted">
            Pre-tick BlueMap in the wizard when a mod/plugin-capable server type
            is chosen.
          </p>
        </div>
        <USwitch v-model="defaultEnabled" class="shrink-0 mt-1" />
      </div>

      <UFormField
        label="Default web port"
        description="Host port pre-filled for new servers. Each BlueMap server still needs a unique port."
      >
        <UInput
          v-model.number="defaultPort"
          type="number"
          placeholder="8100"
          autocomplete="off"
          class="w-full sm:w-48"
        />
      </UFormField>

      <UFormField
        label="Map link host"
        description="Optional. Hostname or IP used to build the dashboard's Map links. Defaults to the host serving this dashboard."
      >
        <UInput
          v-model="publicHost"
          placeholder="203.0.113.10 or map.example.com"
          autocomplete="off"
          class="w-full"
        />
      </UFormField>

      <div class="flex justify-end">
        <UButton :loading="saving" @click="save">Save</UButton>
      </div>
    </div>

    <template #footer>
      <p class="text-xs text-dimmed">
        These are defaults for <span class="font-medium">new</span> servers;
        existing ones keep their own settings. BlueMap won't render until you set
        <span class="font-mono">accept-download: true</span> in
        <span class="font-mono">bluemap/core.conf</span> after a server's first
        start.
      </p>
    </template>
  </UCard>
</template>

<script setup lang="ts">
interface Settings {
  publicHost?: string;
  bluemap?: {
    defaultEnabled?: boolean;
    defaultPort?: number;
    publicHost?: string;
  };
}

const toast = useToast();
const { data: settings, refresh } = useFetch<Settings>("/api/admin/settings", {
  key: "admin-settings",
  default: () => ({}),
});

const defaultEnabled = ref(false);
const defaultPort = ref<number>(8100);
const publicHost = ref("");

watch(
  settings,
  (s) => {
    defaultEnabled.value = s?.bluemap?.defaultEnabled ?? false;
    defaultPort.value = s?.bluemap?.defaultPort ?? 8100;
    publicHost.value = s?.bluemap?.publicHost ?? "";
  },
  { immediate: true }
);

const saving = ref(false);

async function save() {
  saving.value = true;
  try {
    await $fetch("/api/admin/settings", {
      method: "PUT",
      body: {
        bluemap: {
          defaultEnabled: defaultEnabled.value,
          defaultPort: defaultPort.value || 8100,
          publicHost: publicHost.value.trim(),
        },
      },
    });
    await refresh();
    toast.add({ title: "BlueMap settings saved", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not save",
      description: (error as Error).message,
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}
</script>
