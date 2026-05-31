<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Secrets</h2>
      <p class="text-sm text-muted">
        Stored once and injected into every server that needs them. Values are
        write-only — they're never shown again after saving.
      </p>
    </template>

    <div class="divide-y divide-default">
      <div
        v-for="secret in secrets"
        :key="secret.key"
        class="py-4 first:pt-0 last:pb-0 space-y-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="font-medium">{{ secret.label }}</h3>
              <UBadge
                :color="secret.set ? 'success' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ secret.set ? "Set" : "Not set" }}
              </UBadge>
            </div>
            <p class="text-sm text-muted mt-0.5">{{ secret.description }}</p>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-dimmed">
              <span v-if="secret.set" class="font-mono">{{ secret.preview }}</span>
              <span v-if="secret.envVar" class="font-mono">→ {{ secret.envVar }}</span>
              <ULink
                v-if="secret.docsUrl"
                :to="secret.docsUrl"
                target="_blank"
                class="text-primary"
              >
                Get key
              </ULink>
            </div>
          </div>

          <UButton
            v-if="secret.set"
            color="error"
            variant="ghost"
            size="xs"
            icon="i-heroicons-trash"
            :loading="busy === secret.key + ':clear'"
            @click="clearSecret(secret.key)"
          >
            Clear
          </UButton>
        </div>

        <div class="flex items-center gap-2">
          <UInput
            v-model="drafts[secret.key]"
            type="password"
            autocomplete="off"
            :placeholder="secret.set ? 'Enter a new value to replace' : 'Paste value'"
            class="flex-1"
          />
          <UButton
            :disabled="!drafts[secret.key]"
            :loading="busy === secret.key + ':save'"
            @click="saveSecret(secret.key)"
          >
            Save
          </UButton>
        </div>
      </div>
    </div>

    <template #footer>
      <p class="text-xs text-dimmed">
        Changing a secret only affects new or recreated servers. Use
        <span class="font-medium">Re-apply to all servers</span> below to push it
        to servers that already exist.
      </p>
    </template>
  </UCard>
</template>

<script setup lang="ts">
interface Secret {
  key: string;
  label: string;
  description: string;
  docsUrl?: string;
  envVar?: string;
  appliesTo: string[];
  set: boolean;
  preview: string;
}

const toast = useToast();
const { data: secrets, refresh } = useFetch<Secret[]>("/api/admin/secrets", {
  key: "admin-secrets",
  default: () => [],
});

const drafts = reactive<Record<string, string>>({});
const busy = ref<string | null>(null);

async function saveSecret(key: string) {
  const value = drafts[key];
  if (!value) return;
  busy.value = key + ":save";
  try {
    await $fetch(`/api/admin/secrets/${key}`, {
      method: "PUT",
      body: { value },
    });
    drafts[key] = "";
    await refresh();
    toast.add({ title: "Secret saved", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not save secret",
      description: (error as Error).message,
      color: "error",
    });
  } finally {
    busy.value = null;
  }
}

async function clearSecret(key: string) {
  busy.value = key + ":clear";
  try {
    await $fetch(`/api/admin/secrets/${key}`, { method: "DELETE" });
    await refresh();
    toast.add({ title: "Secret cleared", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not clear secret",
      description: (error as Error).message,
      color: "error",
    });
  } finally {
    busy.value = null;
  }
}
</script>
