<template>
  <AuthShell
    :title="request ? `Connect ${request.client.name}` : 'Connect an app'"
    :description="
      request
        ? `${request.client.name} wants to access MCSM as ${user?.name}.`
        : undefined
    "
  >
    <div class="flex w-full flex-col gap-4">
      <UAlert
        v-if="error"
        icon="i-heroicons-exclamation-triangle"
        color="error"
        variant="soft"
        title="This authorization request is invalid"
        :description="errorMessage(error, 'The app sent a malformed request.')"
      />

      <template v-else-if="request">
        <ul class="flex flex-col gap-2">
          <li
            v-for="scope in request.scopes"
            :key="scope"
            class="flex gap-3 rounded-md border border-default px-3 py-2"
          >
            <UIcon
              name="i-heroicons-check-circle"
              class="mt-0.5 size-5 shrink-0 text-primary"
            />
            <div>
              <p class="text-sm font-medium">
                {{ MCP_SCOPE_LABELS[scope as McpScope]?.label ?? scope }}
              </p>
              <p class="text-xs text-muted">
                {{ MCP_SCOPE_LABELS[scope as McpScope]?.description }}
              </p>
            </div>
          </li>
        </ul>

        <p class="text-xs text-muted">
          Only on servers you have access to, and never more than your role
          there allows. You'll be sent back to
          <span class="font-medium text-default">{{
            request.redirectHost
          }}</span
          >. You can disconnect the app any time under "AI access" in your user
          menu.
        </p>

        <div class="flex gap-2">
          <UButton
            block
            color="neutral"
            variant="outline"
            :loading="submitting === 'deny'"
            :disabled="!!submitting"
            @click="decide('deny')"
          >
            Deny
          </UButton>
          <UButton
            block
            :loading="submitting === 'approve'"
            :disabled="!!submitting"
            @click="decide('approve')"
          >
            Allow
          </UButton>
        </div>
      </template>
    </div>
  </AuthShell>
</template>

<script setup lang="ts">
import { errorMessage } from "~/utils/errors";
import { MCP_SCOPE_LABELS, type McpScope } from "#shared/utils/mcpScopes";

definePageMeta({ layout: false });

useSeoMeta({ title: "Connect app · MCSM" });

const route = useRoute();
const toast = useToast();
const { user } = useUserSession();

const params = computed(() =>
  Object.fromEntries(
    Object.entries(route.query).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []
    )
  )
);

const { data: request, error } = await useFetch("/api/oauth/authorize", {
  query: params,
});

const submitting = ref<"approve" | "deny" | null>(null);

async function decide(decision: "approve" | "deny") {
  submitting.value = decision;
  try {
    const { redirectTo } = await $fetch("/api/oauth/authorize", {
      method: "POST",
      body: { decision, params: params.value },
    });
    // Full navigation: the target is the client's callback, often a
    // localhost listener or a custom scheme.
    window.location.href = redirectTo;
  } catch (fetchError) {
    submitting.value = null;
    toast.add({
      title: "Authorization failed",
      description: errorMessage(fetchError, "Could not complete the request."),
      color: "error",
    });
  }
}
</script>
