<template>
  <UModal
    v-model:open="open"
    title="AI access"
    description="Let AI assistants like Claude or Cursor manage your servers through MCP."
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div class="space-y-6">
        <!-- Connect -->
        <section class="space-y-2">
          <h3 class="text-sm font-semibold">Connect</h3>
          <p class="text-sm text-muted">
            Add this URL as a remote MCP server. Your client opens MCSM in the
            browser so you can sign in and approve it.
          </p>
          <CopyField :value="endpoint" />
          <CopyField
            :value="`claude mcp add --transport http mcsm ${endpoint}`"
          />
        </section>

        <!-- Connected apps -->
        <section class="space-y-2">
          <h3 class="text-sm font-semibold">Connected apps</h3>
          <p v-if="!connections.length" class="text-sm text-muted">
            No apps connected yet.
          </p>
          <div
            v-for="connection in connections"
            :key="connection.id"
            class="flex items-center justify-between gap-3 rounded-md border border-default px-3 py-2"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">{{ connection.name }}</p>
              <p class="text-xs text-dimmed">
                {{ scopeLabels(connection.scopes) }} ·
                {{ lastUsed(connection.lastUsedAt) }}
              </p>
            </div>
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              label="Disconnect"
              @click="disconnect(connection.id)"
            />
          </div>
        </section>

        <!-- Personal access tokens -->
        <section class="space-y-2">
          <h3 class="text-sm font-semibold">Personal access tokens</h3>
          <p class="text-sm text-muted">
            For clients and scripts that can't sign in through the browser. Send
            the token as <code>Authorization: Bearer &lt;token&gt;</code>.
          </p>

          <UAlert
            v-if="createdToken"
            color="success"
            variant="soft"
            icon="i-heroicons-key"
            title="Copy your token now — it won't be shown again."
          >
            <template #description>
              <div class="mt-2 space-y-2">
                <CopyField :value="createdToken" />
                <CopyField
                  :value="`claude mcp add --transport http mcsm ${endpoint} --header &quot;Authorization: Bearer ${createdToken}&quot;`"
                />
              </div>
            </template>
          </UAlert>

          <div
            v-for="token in tokens"
            :key="token.id"
            class="flex items-center justify-between gap-3 rounded-md border border-default px-3 py-2"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">
                {{ token.name }}
                <span class="font-mono text-xs text-dimmed"
                  >{{ token.prefix }}…</span
                >
              </p>
              <p class="text-xs text-dimmed">
                {{ scopeLabels(token.scopes) }} ·
                {{ lastUsed(token.lastUsedAt) }}
              </p>
            </div>
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-heroicons-trash"
              aria-label="Delete token"
              @click="deleteToken(token.id)"
            />
          </div>

          <form
            class="space-y-3 rounded-md border border-dashed border-default p-3"
            @submit.prevent="createToken"
          >
            <UFormField label="Name">
              <UInput
                v-model="newName"
                placeholder="e.g. Home Assistant"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Scopes">
              <UCheckboxGroup
                v-model="newScopes"
                :items="scopeItems"
                value-key="value"
              />
            </UFormField>
            <div class="flex justify-end">
              <UButton
                type="submit"
                icon="i-heroicons-plus"
                :loading="creating"
                :disabled="!newName.trim() || !newScopes.length"
              >
                Create token
              </UButton>
            </div>
          </form>
        </section>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { errorMessage } from "~/utils/errors";
import {
  MCP_SCOPES,
  MCP_SCOPE_LABELS,
  type McpScope,
} from "#shared/utils/mcpScopes";

const open = defineModel<boolean>("open", { default: false });

const toast = useToast();
const endpoint = computed(() =>
  import.meta.client ? `${window.location.origin}/mcp` : "/mcp"
);

const { data: tokens, refresh: refreshTokens } = useFetch("/api/me/tokens", {
  key: "my-mcp-tokens",
  default: () => [],
  immediate: false,
});
const { data: connections, refresh: refreshConnections } = useFetch(
  "/api/me/connections",
  { key: "my-mcp-connections", default: () => [], immediate: false }
);

watch(open, (value) => {
  if (value) {
    refreshTokens();
    refreshConnections();
  } else {
    createdToken.value = null;
  }
});

const scopeItems = MCP_SCOPES.map((scope) => ({
  value: scope,
  label: MCP_SCOPE_LABELS[scope].label,
  description: MCP_SCOPE_LABELS[scope].description,
}));

function scopeLabels(scopes: string[]) {
  return scopes
    .map((scope) => MCP_SCOPE_LABELS[scope as McpScope]?.label ?? scope)
    .join(", ");
}

function lastUsed(at: number | null) {
  return at ? `used ${new Date(at).toLocaleString()}` : "never used";
}

const newName = ref("");
const newScopes = ref<McpScope[]>(["servers:read"]);
const creating = ref(false);
const createdToken = ref<string | null>(null);

async function createToken() {
  creating.value = true;
  try {
    const { token } = await $fetch("/api/me/tokens", {
      method: "POST",
      body: { name: newName.value.trim(), scopes: newScopes.value },
    });
    createdToken.value = token;
    newName.value = "";
    await refreshTokens();
  } catch (error) {
    toast.add({
      title: "Could not create token",
      description: errorMessage(error, "Creating the token failed."),
      color: "error",
    });
  } finally {
    creating.value = false;
  }
}

async function deleteToken(id: number) {
  try {
    await $fetch(`/api/me/tokens/${id}`, { method: "DELETE" });
    await refreshTokens();
    toast.add({ title: "Token deleted", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not delete token",
      description: errorMessage(error, "Deleting the token failed."),
      color: "error",
    });
  }
}

async function disconnect(id: number) {
  try {
    await $fetch(`/api/me/connections/${id}`, { method: "DELETE" });
    await refreshConnections();
    toast.add({ title: "App disconnected", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not disconnect app",
      description: errorMessage(error, "Disconnecting failed."),
      color: "error",
    });
  }
}
</script>
