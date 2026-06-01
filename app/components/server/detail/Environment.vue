<template>
  <div v-if="!server?.config" class="py-16 text-center text-muted space-y-3">
    <UIcon
      name="i-heroicons-exclamation-triangle"
      class="size-8 mx-auto opacity-60"
    />
    <p>
      This server has no stored configuration, so its environment can't be
      edited here.
    </p>
  </div>

  <div v-else class="space-y-6 pb-24">
    <!-- Custom variables (editable) -->
    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold">Custom variables</h3>
          <p class="text-sm text-muted">
            Anything the
            <NuxtLink
              to="https://docker-minecraft-server.readthedocs.io/en/latest/variables/"
              target="_blank"
              external
              class="text-primary hover:underline"
              >itzg/minecraft-server image</NuxtLink
            >
            supports can be set here. Saving recreates the container.
          </p>
        </div>
      </template>

      <div class="space-y-2">
        <div
          v-for="(envVar, index) in customEnv"
          :key="index"
          class="flex gap-2 items-start"
        >
          <UInput
            v-model="envVar.key"
            placeholder="VARIABLE_NAME"
            class="w-64 font-mono"
            :color="envVar.key && !isValidEnvKey(envVar.key) ? 'error' : undefined"
          />
          <UInput
            v-model="envVar.value"
            placeholder="value"
            class="flex-1 font-mono"
          />
          <UButton
            icon="i-heroicons-x-mark-20-solid"
            variant="ghost"
            color="error"
            aria-label="Remove variable"
            @click="customEnv.splice(index, 1)"
          />
        </div>

        <p v-if="hasInvalidKeys" class="text-xs text-error">
          Variable names may only contain letters, digits and underscores, and
          can't start with a digit.
        </p>

        <p v-if="!customEnv.length" class="text-sm text-muted py-2">
          No custom variables defined.
        </p>

        <UButton
          icon="i-heroicons-plus-20-solid"
          variant="soft"
          color="neutral"
          size="sm"
          @click="customEnv.push({ key: '', value: '' })"
        >
          Add variable
        </UButton>
      </div>
    </UCard>

    <!-- All container variables (read-only with override) -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold">Container environment</h3>
            <p class="text-sm text-muted">
              Everything the running container actually sees.
            </p>
          </div>
          <UButton
            icon="i-heroicons-arrow-path-20-solid"
            variant="ghost"
            color="neutral"
            size="xs"
            aria-label="Refresh environment"
            :loading="status === 'pending'"
            @click="refresh()"
          />
        </div>
      </template>

      <div class="divide-y divide-default">
        <div
          v-for="envVar in containerEnv"
          :key="envVar.key"
          class="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
        >
          <UBadge
            :color="SOURCE_BADGES[envVar.source].color"
            variant="soft"
            size="sm"
            class="w-20 justify-center shrink-0"
          >
            {{ SOURCE_BADGES[envVar.source].label }}
          </UBadge>

          <code class="text-xs font-mono font-semibold shrink-0 w-56 truncate">{{
            envVar.key
          }}</code>

          <code
            class="text-xs font-mono text-muted flex-1 min-w-0 truncate"
            :title="envVar.sensitive ? undefined : envVar.value"
            >{{ envVar.value }}</code
          >

          <UTooltip
            v-if="envVar.source === 'managed'"
            text="Managed by MCSM — change it on the Configuration tab"
          >
            <UIcon
              name="i-heroicons-lock-closed-20-solid"
              class="size-4 text-dimmed shrink-0"
            />
          </UTooltip>
          <UButton
            v-else-if="envVar.source === 'image' && !envVar.sensitive"
            size="xs"
            variant="ghost"
            color="neutral"
            class="shrink-0"
            @click="overrideVar(envVar)"
          >
            Override
          </UButton>
          <span v-else class="w-[18px] shrink-0" />
        </div>
      </div>
    </UCard>

    <!-- Sticky save bar -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="translate-y-4 opacity-0"
      leave-active-class="transition duration-200"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div v-if="dirty" class="fixed bottom-6 inset-x-0 z-40 px-4">
        <div
          class="mx-auto max-w-3xl rounded-lg shadow-lg ring-1 ring-default bg-default/95 backdrop-blur p-3 flex flex-wrap items-center gap-3"
        >
          <UIcon
            name="i-heroicons-exclamation-triangle-20-solid"
            class="size-5 text-warning shrink-0"
          />
          <p class="text-sm flex-1 min-w-48">
            Unsaved changes — saving recreates the container (world is kept).
          </p>
          <div class="flex gap-2 ms-auto">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="saving"
              @click="resetDraft"
            >
              Discard
            </UButton>
            <UButton
              icon="i-heroicons-rocket-launch-20-solid"
              :loading="saving"
              @click="save"
            >
              Save & Apply
            </UButton>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
const { id, server } = useServerDetail();
const router = useRouter();
const toast = useToast();

// --- Container env (read-only listing) ----------------------------------------

type EnvVar = {
  key: string;
  value: string;
  sensitive: boolean;
  source: "managed" | "custom" | "image";
};

const {
  data: containerEnv,
  refresh,
  status,
} = useFetch<EnvVar[]>(() => `/api/server/${id.value}/env`, {
  default: () => [],
});

const SOURCE_BADGES = {
  managed: { label: "managed", color: "neutral" as const },
  custom: { label: "custom", color: "primary" as const },
  image: { label: "image", color: "info" as const },
};

// --- Custom env draft ------------------------------------------------------------

const customEnv = ref<{ key: string; value: string }[]>([]);
const original = ref("");

function resetDraft() {
  customEnv.value = JSON.parse(
    JSON.stringify(server.value?.config?.customEnv ?? [])
  );
  original.value = JSON.stringify(customEnv.value);
}

watch(server, resetDraft, { immediate: true });

const dirty = computed(
  () => JSON.stringify(customEnv.value) !== original.value
);

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return confirm("You have unsaved environment changes. Leave anyway?");
});

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isValidEnvKey(key: string) {
  return ENV_KEY_PATTERN.test(key);
}

const hasInvalidKeys = computed(() =>
  customEnv.value.some((envVar) => envVar.key && !isValidEnvKey(envVar.key))
);

/** Copy an image-default variable into the custom list for overriding. */
function overrideVar(envVar: EnvVar) {
  if (
    customEnv.value.some(
      (existing) => existing.key.toUpperCase() === envVar.key.toUpperCase()
    )
  )
    return;
  customEnv.value.push({ key: envVar.key, value: envVar.value });
}

// --- Save ---------------------------------------------------------------------------

const saving = ref(false);

async function save() {
  const config = server.value?.config;
  if (!config) return;
  saving.value = true;
  try {
    const result = await $fetch<{ id: string }>(`/api/server/${id.value}`, {
      method: "PUT",
      body: {
        ...config,
        customEnv: customEnv.value.filter(
          (envVar) => isValidEnvKey(envVar.key) && envVar.value !== ""
        ),
      },
    });

    toast.add({
      title: "Environment saved",
      description: "The container was recreated with the new variables.",
      color: "success",
    });

    original.value = JSON.stringify(customEnv.value);
    await refreshNuxtData("servers");
    await router.replace(`/server/${result.id}/environment`);
  } catch {
    toast.add({
      title: "Error",
      description: "Failed to save the environment.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}
</script>
