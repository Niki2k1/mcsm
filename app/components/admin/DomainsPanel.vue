<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Domains</h2>
      <p class="text-sm text-muted">
        Base domains offered in the create wizard. Point a wildcard DNS record
        (e.g. <span class="font-mono">*.example.com</span>) at the Infrarust
        host for each one.
      </p>
    </template>

    <div class="space-y-3">
      <!-- Public address used to verify DNS points here. -->
      <UFormField
        label="Server's public address"
        description="Optional. Used to confirm a domain's DNS resolves to this host."
      >
        <div class="flex items-center gap-2">
          <UInput
            v-model="publicHost"
            placeholder="203.0.113.10 or mc.example.com"
            autocomplete="off"
            class="flex-1"
          />
          <UButton
            color="neutral"
            variant="subtle"
            :loading="savingHost"
            @click="savePublicHost"
          >
            Save
          </UButton>
        </div>
      </UFormField>

      <USeparator />

      <div
        v-if="!domains.length"
        class="text-sm text-muted text-center py-4"
      >
        No domains yet. Add one below.
      </div>

      <div
        v-for="domain in domains"
        :key="domain"
        class="rounded-md border border-default px-3 py-2 space-y-2"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-mono truncate">{{ domain }}</p>
            <p class="text-xs text-dimmed">
              {{ usage(domain) }}
              {{ usage(domain) === 1 ? "server" : "servers" }} using it
            </p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-heroicons-signal"
              label="Check"
              :loading="checks[domain]?.loading"
              @click="runCheck(domain)"
            />
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-heroicons-trash"
              aria-label="Delete domain"
              @click="askDelete(domain)"
            />
          </div>
        </div>

        <AdminCheckResult
          v-if="checks[domain]?.data"
          :result="checks[domain]!.data!"
        />
      </div>
    </div>

    <template #footer>
      <form class="flex items-center gap-2" @submit.prevent="addDomain">
        <UInput
          v-model="newDomain"
          placeholder="example.com"
          autocomplete="off"
          class="flex-1"
        />
        <UButton type="submit" :disabled="!newDomain" :loading="adding">
          Add
        </UButton>
      </form>
    </template>

    <UModal v-model:open="confirmOpen" title="Delete domain">
      <template #body>
        <p class="text-sm">
          Delete <span class="font-mono">{{ pending }}</span>? It will no longer
          be offered in the wizard.
        </p>
        <p
          v-if="pending && usage(pending) > 0"
          class="mt-2 text-sm text-warning"
        >
          {{ usage(pending) }} existing
          {{ usage(pending) === 1 ? "server uses" : "servers use" }} it — they
          keep running, but routing breaks if you recreate them on a removed
          domain.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="confirmOpen = false">
            Cancel
          </UButton>
          <UButton color="error" :loading="deleting" @click="deleteDomain">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
interface ServerSummary {
  id: string;
  domain: string;
}

const toast = useToast();

const { data: domains, refresh } = useFetch<string[]>("/api/domains", {
  key: "admin-domains",
  default: () => [],
});
const { data: servers } = useFetch<ServerSummary[]>("/api/server", {
  key: "servers",
  default: () => [],
});

const usage = (base: string) =>
  servers.value.filter(
    (s) => s.domain === base || s.domain.endsWith(`.${base}`)
  ).length;

// --- Public address (for DNS verification) ---
interface CheckData {
  target: string;
  mode: "wildcard" | "server";
  port: number;
  dns: { ok: boolean; addresses: string[]; error?: string };
  expected?: { host: string; addresses: string[]; matches: boolean };
  tcp: { ok: boolean; ms?: number; error?: string };
  mc: unknown | null;
}

const { data: settings } = useFetch<{ publicHost?: string }>(
  "/api/admin/settings",
  { key: "admin-settings", default: () => ({}) }
);
const publicHost = ref("");
watch(settings, (s) => (publicHost.value = s?.publicHost ?? ""), {
  immediate: true,
});
const savingHost = ref(false);

async function savePublicHost() {
  savingHost.value = true;
  try {
    await $fetch("/api/admin/settings", {
      method: "PUT",
      body: { publicHost: publicHost.value.trim() },
    });
    toast.add({ title: "Saved", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not save",
      description: (error as Error).message,
      color: "error",
    });
  } finally {
    savingHost.value = false;
  }
}

// --- Per-domain diagnostics ---
const checks = reactive<
  Record<string, { loading: boolean; data: CheckData | null }>
>({});

async function runCheck(domain: string) {
  checks[domain] = { loading: true, data: checks[domain]?.data ?? null };
  try {
    const data = await $fetch<CheckData>("/api/admin/check", {
      query: { host: domain, mode: "wildcard" },
    });
    checks[domain] = { loading: false, data };
  } catch (error) {
    checks[domain] = { loading: false, data: checks[domain]?.data ?? null };
    toast.add({
      title: "Check failed",
      description: (error as { statusMessage?: string }).statusMessage,
      color: "error",
    });
  }
}

const newDomain = ref("");
const adding = ref(false);

async function addDomain() {
  const domain = newDomain.value.trim().toLowerCase();
  if (!domain) return;
  adding.value = true;
  try {
    await $fetch("/api/domains/create", { method: "POST", body: { domain } });
    newDomain.value = "";
    await refresh();
    toast.add({ title: "Domain added", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not add domain",
      description: (error as { statusMessage?: string }).statusMessage,
      color: "error",
    });
  } finally {
    adding.value = false;
  }
}

const confirmOpen = ref(false);
const pending = ref<string | null>(null);
const deleting = ref(false);

function askDelete(domain: string) {
  pending.value = domain;
  confirmOpen.value = true;
}

async function deleteDomain() {
  if (!pending.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/domains/${encodeURIComponent(pending.value)}/delete`, {
      method: "POST",
    });
    await refresh();
    toast.add({ title: "Domain deleted", color: "success" });
    confirmOpen.value = false;
  } catch (error) {
    toast.add({
      title: "Could not delete domain",
      description: (error as { statusMessage?: string }).statusMessage,
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
}
</script>
