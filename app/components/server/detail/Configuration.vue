<template>
  <div v-if="!server?.config" class="py-16 text-center text-muted space-y-3">
    <UIcon
      name="i-heroicons-exclamation-triangle"
      class="size-8 mx-auto opacity-60"
    />
    <p>
      This server has no stored configuration — it was probably created outside
      MCSM.
    </p>
  </div>

  <div v-else-if="form" class="space-y-6 pb-24">
    <UAlert
      icon="i-heroicons-information-circle"
      color="neutral"
      variant="soft"
      title="Saving recreates the container"
      description="Configuration is applied by recreating the Docker container. The world data is kept, but the server restarts."
    />

    <!-- Game -->
    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold">Game</h3>
          <p class="text-sm text-muted">
            Server type, version and resources.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UFormField
          label="Type"
          help="The server type is fixed when the server is created."
        >
          <UBadge color="neutral" variant="soft" size="lg">{{
            form.type
          }}</UBadge>
        </UFormField>

        <UFormField
          v-if="form.type === 'VANILLA'"
          label="Version"
          name="VERSION"
        >
          <USelectMenu
            v-model="version"
            :items="versionOptions"
            class="w-full max-w-xs"
          />
        </UFormField>

        <template v-if="form.type === 'FTBA'">
          <UFormField label="Modpack ID" name="FTB_MODPACK_ID" required>
            <UInput v-model="ftbModpackId" class="w-full max-w-xs" />
          </UFormField>
          <UFormField label="Modpack Version ID" name="FTB_MODPACK_VERSION_ID">
            <UInput v-model="ftbModpackVersionId" class="w-full max-w-xs" />
          </UFormField>
        </template>

        <template v-if="form.type === 'AUTO_CURSEFORGE'">
          <UFormField label="Modpack Slug" name="CF_SLUG" required>
            <UInput
              v-model="cfSlug"
              placeholder="all-the-mods-8"
              class="w-full max-w-xs"
            />
          </UFormField>
          <UFormField label="File ID" name="CF_FILE_ID">
            <UInput v-model="cfFileId" class="w-full max-w-xs" />
          </UFormField>
        </template>

        <UFormField
          label="Memory"
          name="memory"
          help="Heap size for the Minecraft server. The container gets 1 GB extra headroom."
        >
          <UTabs
            v-model="memory"
            :items="memoryOptions"
            :content="false"
            class="max-w-xs"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- World & Gameplay -->
    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold">World & Gameplay</h3>
          <p class="text-sm text-muted">
            How the server presents itself and plays.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UFormField label="Message of the Day (MOTD)" name="MOTD">
          <MotdEditor v-model="form.MOTD" />
        </UFormField>

        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField label="World Name" name="LEVEL">
            <UInput v-model="form.LEVEL" placeholder="world" class="w-full" />
          </UFormField>

          <UFormField label="Difficulty" name="DIFFICULTY">
            <USelectMenu
              v-model="form.DIFFICULTY"
              :items="difficultyOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Max Players" name="MAX_PLAYERS">
            <UInput
              v-model.number="form.MAX_PLAYERS"
              type="number"
              class="w-full"
            />
          </UFormField>
        </div>

        <USeparator />

        <div class="space-y-3">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium">Hardcore</p>
              <p class="text-xs text-muted">
                One life per player — death means spectator mode.
              </p>
            </div>
            <USwitch v-model="form.HARDCORE" />
          </div>

          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium">Online Mode</p>
              <p class="text-xs text-muted">
                Verify players against Mojang's servers (recommended).
              </p>
            </div>
            <USwitch v-model="form.ONLINE_MODE" />
          </div>

          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium">Allow Flight</p>
              <p class="text-xs text-muted">
                Don't kick survival players that appear to be flying.
              </p>
            </div>
            <USwitch v-model="form.ALLOW_FLIGHT" />
          </div>
        </div>
      </div>
    </UCard>

    <!-- Players baseline -->
    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold">Players</h3>
          <p class="text-sm text-muted">
            The operator and whitelist baseline applied when the container is
            (re)created. For live changes without a restart, use the
            <NuxtLink
              :to="`/server/${id}/players`"
              class="text-primary hover:underline"
              >Players tab</NuxtLink
            >.
          </p>
        </div>
      </template>

      <div class="grid sm:grid-cols-2 gap-6">
        <UserList v-model="form.operators" title="Operators" />
        <UserList v-model="form.whitelist" title="Whitelist" />
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
              @click="resetForm"
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
import MotdEditor from "~/components/server/motd/MotdEditor.vue";

const { id, server } = useServerDetail();
const router = useRouter();
const toast = useToast();

// --- Local editable copy of the persisted config -----------------------------

const form = ref<CreateForm | null>(null);
const original = ref("");

function resetForm() {
  const config = server.value?.config;
  if (!config) {
    form.value = null;
    return;
  }
  // Deep copy so edits never leak into the shared server state, merged over
  // defaults so configs created by older versions have all fields.
  form.value = JSON.parse(
    JSON.stringify({ ...defaultCreateForm(), ...config })
  );
  original.value = JSON.stringify(form.value);
}

watch(server, resetForm, { immediate: true });

const dirty = computed(
  () => !!form.value && JSON.stringify(form.value) !== original.value
);

// Warn when leaving the page with unsaved changes.
onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return confirm("You have unsaved configuration changes. Leave anyway?");
});

// --- Field helpers ------------------------------------------------------------

const { data: versionOptions } = useFetch<{ label: string; value: number }[]>(
  "/api/minecraft/versions",
  { default: () => [] }
);

// USelectMenu works with object items; bind through a computed so clearing
// works and the form keeps the {label, value} shape the API expects.
const version = computed({
  get: () => form.value?.VERSION ?? undefined,
  set: (value) => {
    if (form.value) form.value.VERSION = value ?? null;
  },
});

const memory = computed({
  get: () => form.value?.memory ?? "2GB",
  set: (value) => {
    if (form.value) form.value.memory = value;
  },
});

const memoryOptions = [
  { label: "2GB", value: "2GB", icon: "i-heroicons-user-16-solid" },
  { label: "4GB", value: "4GB", icon: "i-heroicons-users-16-solid" },
  { label: "8GB", value: "8GB", icon: "i-heroicons-user-group-16-solid" },
];

// UInput's v-model rejects null; these config fields use null for "unset",
// so bridge null <-> undefined through computeds.
function nullableField(
  key: "FTB_MODPACK_ID" | "FTB_MODPACK_VERSION_ID" | "CF_SLUG" | "CF_FILE_ID"
) {
  return computed({
    get: () => form.value?.[key] ?? undefined,
    set: (value: string | undefined) => {
      if (form.value) form.value[key] = value || null;
    },
  });
}

const ftbModpackId = nullableField("FTB_MODPACK_ID");
const ftbModpackVersionId = nullableField("FTB_MODPACK_VERSION_ID");
const cfSlug = nullableField("CF_SLUG");
const cfFileId = nullableField("CF_FILE_ID");

const difficultyOptions = [
  { label: "Peaceful", value: "peaceful" },
  { label: "Easy", value: "easy" },
  { label: "Normal", value: "normal" },
  { label: "Hard", value: "hard" },
];

// --- Save ---------------------------------------------------------------------

const saving = ref(false);

async function save() {
  if (!form.value) return;
  saving.value = true;
  try {
    const result = await $fetch<{ id: string }>(`/api/server/${id.value}`, {
      method: "PUT",
      body: form.value,
    });

    toast.add({
      title: "Configuration saved",
      description: "The container was recreated with the new configuration.",
      color: "success",
    });

    // Mark the form clean BEFORE navigating so the leave guard doesn't fire.
    original.value = JSON.stringify(form.value);

    await refreshNuxtData("servers");
    // The container was recreated under a new id — move to its page.
    await router.replace(`/server/${result.id}/configuration`);
  } catch {
    toast.add({
      title: "Error",
      description: "Failed to save the configuration.",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}
</script>
