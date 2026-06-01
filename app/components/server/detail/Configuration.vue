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
            Server type, version, world generation and resources.
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

        <div class="grid sm:grid-cols-2 gap-4">
          <UFormField label="Game Mode" name="MODE">
            <USelectMenu
              v-model="form.MODE"
              :items="modeOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="World Type"
            name="LEVEL_TYPE"
            help="Only affects newly generated worlds."
          >
            <USelectMenu
              v-model="form.LEVEL_TYPE"
              :items="levelTypeOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="World Seed"
            name="SEED"
            help="Only used when a new world is generated."
          >
            <UInput
              v-model="seed"
              placeholder="Random"
              class="w-full font-mono"
            />
          </UFormField>
        </div>

        <UFormField
          label="Memory"
          name="memory"
          help="Heap size for the Minecraft server. The container gets 1 GB extra headroom."
        >
          <div class="flex items-center gap-3 flex-wrap">
            <UTabs
              v-model="memory"
              :items="memoryOptions"
              :content="false"
            />
            <div class="flex items-center gap-1.5">
              <UInput
                v-model.number="memoryGb"
                type="number"
                :min="1"
                :max="64"
                class="w-20"
              />
              <span class="text-sm text-muted">GB</span>
            </div>
          </div>
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

        <div class="grid sm:grid-cols-3 gap-4">
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

          <UFormField
            label="Spawn Protection"
            name="SPAWN_PROTECTION"
            help="Radius in blocks only operators can edit (0 = off)."
          >
            <UInput
              v-model.number="form.SPAWN_PROTECTION"
              type="number"
              :min="0"
              class="w-full"
            />
          </UFormField>
        </div>

        <USeparator />

        <div class="grid sm:grid-cols-2 gap-x-8 gap-y-3">
          <ServerDetailToggleRow
            v-for="toggle in gameplayToggles"
            :key="toggle.key"
            v-model="form[toggle.key]"
            :label="toggle.label"
            :description="toggle.description"
          />
        </div>
      </div>
    </UCard>

    <!-- Performance & Cost -->
    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold">Performance</h3>
          <p class="text-sm text-muted">
            Resource usage, idle behaviour and JVM tuning.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <div class="grid sm:grid-cols-3 gap-4">
          <UFormField
            label="View Distance"
            name="VIEW_DISTANCE"
            help="Chunks sent to clients (biggest performance lever)."
          >
            <UInput
              v-model.number="form.VIEW_DISTANCE"
              type="number"
              :min="2"
              :max="32"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Simulation Distance"
            name="SIMULATION_DISTANCE"
            help="Chunks where entities/redstone tick."
          >
            <UInput
              v-model.number="form.SIMULATION_DISTANCE"
              type="number"
              :min="2"
              :max="32"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Idle Player Kick"
            name="PLAYER_IDLE_TIMEOUT"
            help="Kick players idle for this many minutes (0 = never)."
          >
            <UInput
              v-model.number="form.PLAYER_IDLE_TIMEOUT"
              type="number"
              :min="0"
              class="w-full"
            />
          </UFormField>
        </div>

        <USeparator />

        <UFormField
          label="When nobody is online"
          name="IDLE_BEHAVIOR"
          help="Pausing freezes the Java process (near-zero CPU, instant wake on connect). Stopping exits the container — start it again from MCSM."
        >
          <UTabs
            v-model="form.IDLE_BEHAVIOR"
            :items="idleBehaviorOptions"
            :content="false"
            class="max-w-md"
          />
        </UFormField>

        <UFormField
          v-if="form.IDLE_BEHAVIOR !== 'none'"
          label="Idle timeout (seconds)"
          name="IDLE_TIMEOUT"
          :help="`${form.IDLE_BEHAVIOR === 'pause' ? 'Pause' : 'Stop'} after this many seconds without players.`"
        >
          <UInput
            v-model.number="form.IDLE_TIMEOUT"
            type="number"
            :min="60"
            class="w-full max-w-xs"
          />
        </UFormField>

        <USeparator />

        <ServerDetailToggleRow
          v-model="form.USE_AIKAR_FLAGS"
          label="Aikar's JVM Flags"
          description="Battle-tested garbage-collector tuning for Minecraft servers. Recommended for 4GB+ servers."
        />
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

      <div class="space-y-4">
        <div class="grid sm:grid-cols-2 gap-6">
          <UserList v-model="form.operators" title="Operators" />
          <UserList v-model="form.whitelist" title="Whitelist" />
        </div>

        <USeparator />

        <div class="grid sm:grid-cols-2 gap-x-8 gap-y-3">
          <ServerDetailToggleRow
            v-model="whitelistEnabled"
            label="Whitelist Enabled"
            description="Only whitelisted players can join the server."
          />
          <ServerDetailToggleRow
            v-model="form.ENFORCE_WHITELIST"
            label="Enforce Whitelist"
            description="Kick connected players that get removed from the whitelist."
          />
          <ServerDetailToggleRow
            v-model="form.HIDE_ONLINE_PLAYERS"
            label="Hide Online Players"
            description="Don't show the player list in the server status."
          />
        </div>
      </div>
    </UCard>

    <!-- Presentation -->
    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold">Presentation</h3>
          <p class="text-sm text-muted">Server icon, resource pack and locale.</p>
        </div>
      </template>

      <div class="space-y-4">
        <!-- 1:1 in-game preview: icon, MOTD and name update live while editing -->
        <UFormField
          label="In-game preview"
          help="Exactly how Minecraft renders this server in the multiplayer screen at the default GUI scale — pixel sizes, colors and effects included. Hover the icon, click the row."
        >
          <ServerListPreview
            :name="form.name ?? server?.name"
            :motd="form.MOTD"
            :favicon="currentFavicon"
            :players="
              ping?.status?.players ?? { online: 0, max: form.MAX_PLAYERS }
            "
            :latency="ping?.latency"
          />
        </UFormField>

        <USeparator />

        <UFormField
          label="Server Icon"
          name="ICON"
          help="Shown in players' server lists. Upload an image (converted to 64x64 in the browser, applied on next restart) or provide a URL that is downloaded at startup."
        >
          <div class="space-y-2 w-full max-w-lg">
            <UButton
              size="sm"
              variant="soft"
              color="neutral"
              icon="i-heroicons-arrow-up-tray-20-solid"
              :loading="uploadingIcon"
              @click="iconInput?.click()"
            >
              Upload image
            </UButton>
            <input
              ref="iconInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onIconUpload"
            />
            <UInput
              v-model="icon"
              placeholder="…or an icon URL"
              class="w-full"
            />
          </div>
        </UFormField>

        <USeparator />

        <UFormField
          label="Resource Pack"
          name="RESOURCE_PACK"
          help="Players download this when joining. Upload a .zip (hosted by MCSM) or link an external URL."
        >
          <div class="flex gap-2 w-full max-w-lg">
            <UInput
              v-model="resourcePack"
              placeholder="https://example.com/pack.zip"
              class="flex-1"
            />
            <UButton
              variant="soft"
              color="neutral"
              icon="i-heroicons-arrow-up-tray-20-solid"
              :loading="uploadingPack"
              @click="packInput?.click()"
            >
              Upload
            </UButton>
            <input
              ref="packInput"
              type="file"
              accept=".zip,application/zip"
              class="hidden"
              @change="onPackUpload"
            />
          </div>
        </UFormField>

        <ServerDetailToggleRow
          v-if="form.RESOURCE_PACK"
          v-model="form.RESOURCE_PACK_ENFORCE"
          label="Require Resource Pack"
          description="Players who decline the resource pack are disconnected."
        />

        <UFormField
          label="Timezone"
          name="TZ"
          help="Container timezone for log timestamps, e.g. Europe/Berlin."
        >
          <UInput
            v-model="timezone"
            placeholder="UTC"
            class="w-full max-w-xs font-mono"
          />
        </UFormField>
      </div>
    </UCard>

    <!-- Advanced -->
    <UCard>
      <template #header>
        <div>
          <h3 class="font-semibold">Advanced</h3>
          <p class="text-sm text-muted">
            Mod/plugin installs and raw server.properties overrides.
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UFormField
          label="Modrinth Projects"
          name="MODRINTH_PROJECTS"
          help="Comma-separated Modrinth project slugs to install as mods/plugins (requires a modded server type)."
        >
          <UInput
            v-model="modrinthProjects"
            placeholder="fabric-api, lithium, sodium"
            class="w-full max-w-lg font-mono"
          />
        </UFormField>

        <UFormField
          v-if="form.type === 'PAPER'"
          label="Spigot Resources"
          name="SPIGET_RESOURCES"
          help="Comma-separated SpigotMC resource IDs to install as plugins."
        >
          <UInput
            v-model="spigetResources"
            placeholder="9089, 34315"
            class="w-full max-w-lg font-mono"
          />
        </UFormField>

        <UFormField
          label="Custom server.properties"
          name="CUSTOM_SERVER_PROPERTIES"
          help="Raw key=value lines for properties MCSM doesn't manage. One per line."
        >
          <UTextarea
            v-model="customProperties"
            placeholder="max-chained-neighbor-updates=1000000&#10;rate-limit=0"
            :rows="4"
            class="w-full max-w-lg font-mono"
          />
        </UFormField>
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

const { id, server, ping } = useServerDetail();
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

// --- Select options ------------------------------------------------------------

const { data: versionOptions } = useFetch<{ label: string; value: number }[]>(
  "/api/minecraft/versions",
  { default: () => [] }
);

const difficultyOptions = [
  { label: "Peaceful", value: "peaceful" },
  { label: "Easy", value: "easy" },
  { label: "Normal", value: "normal" },
  { label: "Hard", value: "hard" },
];

const modeOptions = [
  { label: "Survival", value: "survival" },
  { label: "Creative", value: "creative" },
  { label: "Adventure", value: "adventure" },
  { label: "Spectator", value: "spectator" },
];

const levelTypeOptions = [
  { label: "Default", value: "minecraft:normal" },
  { label: "Superflat", value: "minecraft:flat" },
  { label: "Large Biomes", value: "minecraft:large_biomes" },
  { label: "Amplified", value: "minecraft:amplified" },
  { label: "Single Biome", value: "minecraft:single_biome_surface" },
];

const idleBehaviorOptions = [
  { label: "Keep running", value: "none", icon: "i-heroicons-play-16-solid" },
  { label: "Pause JVM", value: "pause", icon: "i-heroicons-pause-16-solid" },
  { label: "Stop container", value: "stop", icon: "i-heroicons-stop-16-solid" },
];

// --- Toggle rows -----------------------------------------------------------------

type BooleanKey =
  | "PVP"
  | "ENABLE_COMMAND_BLOCK"
  | "HARDCORE"
  | "ONLINE_MODE"
  | "ALLOW_FLIGHT"
  | "SPAWN_ANIMALS"
  | "SPAWN_MONSTERS"
  | "SPAWN_NPCS"
  | "ALLOW_NETHER"
  | "GENERATE_STRUCTURES";

const gameplayToggles: { key: BooleanKey; label: string; description: string }[] =
  [
    {
      key: "PVP",
      label: "PvP",
      description: "Players can damage each other.",
    },
    {
      key: "HARDCORE",
      label: "Hardcore",
      description: "One life per player — death means spectator mode.",
    },
    {
      key: "ONLINE_MODE",
      label: "Online Mode",
      description: "Verify players against Mojang's servers (recommended).",
    },
    {
      key: "ALLOW_FLIGHT",
      label: "Allow Flight",
      description: "Don't kick survival players that appear to be flying.",
    },
    {
      key: "ENABLE_COMMAND_BLOCK",
      label: "Command Blocks",
      description: "Allow command blocks to run commands.",
    },
    {
      key: "SPAWN_ANIMALS",
      label: "Spawn Animals",
      description: "Animals spawn naturally.",
    },
    {
      key: "SPAWN_MONSTERS",
      label: "Spawn Monsters",
      description: "Hostile mobs spawn at night and in the dark.",
    },
    {
      key: "SPAWN_NPCS",
      label: "Spawn Villagers",
      description: "Villagers populate villages.",
    },
    {
      key: "ALLOW_NETHER",
      label: "Allow Nether",
      description: "Nether portals work.",
    },
    {
      key: "GENERATE_STRUCTURES",
      label: "Generate Structures",
      description: "Villages, temples, etc. (newly generated chunks only).",
    },
  ];

// --- Nullable string field helpers ------------------------------------------------

// UInput's v-model rejects null; these config fields use null for "unset",
// so bridge null <-> undefined through computeds.
type NullableKey =
  | "FTB_MODPACK_ID"
  | "FTB_MODPACK_VERSION_ID"
  | "CF_SLUG"
  | "CF_FILE_ID"
  | "SEED"
  | "ICON"
  | "TZ"
  | "MODRINTH_PROJECTS"
  | "SPIGET_RESOURCES"
  | "CUSTOM_SERVER_PROPERTIES";

function nullableField(key: NullableKey) {
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
const seed = nullableField("SEED");
const icon = nullableField("ICON");
const timezone = nullableField("TZ");

// Manual URL edits invalidate the SHA1 a previous upload may have set.
const resourcePack = computed({
  get: () => form.value?.RESOURCE_PACK ?? undefined,
  set: (value: string | undefined) => {
    if (!form.value) return;
    form.value.RESOURCE_PACK = value || null;
    form.value.RESOURCE_PACK_SHA1 = null;
  },
});
const modrinthProjects = nullableField("MODRINTH_PROJECTS");
const spigetResources = nullableField("SPIGET_RESOURCES");
const customProperties = nullableField("CUSTOM_SERVER_PROPERTIES");

const version = computed({
  get: () => form.value?.VERSION ?? undefined,
  set: (value) => {
    if (form.value) form.value.VERSION = value ?? null;
  },
});

// Memory is stored as "<n>GB". The preset tabs and the free number input both
// read/write the same field, so they stay in sync: picking a tab updates the
// input, and typing a non-preset size simply leaves no tab selected.
const memoryOptions = [
  { label: "2GB", value: "2GB", icon: "i-heroicons-user-16-solid" },
  { label: "4GB", value: "4GB", icon: "i-heroicons-users-16-solid" },
  { label: "8GB", value: "8GB", icon: "i-heroicons-user-group-16-solid" },
  { label: "12GB", value: "12GB", icon: "i-heroicons-building-storefront-16-solid" },
  { label: "16GB", value: "16GB", icon: "i-heroicons-building-office-2-16-solid" },
];

const memory = computed({
  get: () => form.value?.memory ?? "2GB",
  set: (value: string) => {
    if (form.value && value) form.value.memory = value;
  },
});

const memoryGb = computed({
  get: () => parseInt(form.value?.memory ?? "2", 10) || 2,
  set: (value: number) => {
    if (!form.value) return;
    const clamped = Math.min(64, Math.max(1, Math.round(value || 1)));
    form.value.memory = `${clamped}GB`;
  },
});

// Whitelist toggle: null in the config means "automatic" (itzg enables the
// whitelist when it has entries) — reflect that until the user decides.
const whitelistEnabled = computed({
  get: () => {
    if (!form.value) return false;
    return form.value.ENABLE_WHITELIST ?? form.value.whitelist.length > 0;
  },
  set: (value: boolean) => {
    if (form.value) form.value.ENABLE_WHITELIST = value;
  },
});

// --- Icon & resource pack uploads -----------------------------------------------------

const iconInput = useTemplateRef<HTMLInputElement>("iconInput");
const packInput = useTemplateRef<HTMLInputElement>("packInput");
const uploadingIcon = ref(false);
const uploadingPack = ref(false);

/**
 * Icon for previews: the ICON URL in the form drives it (uploaded or typed),
 * falling back to whatever the running server currently reports.
 */
const currentFavicon = computed(
  () => form.value?.ICON || ping.value?.status?.favicon
);

/**
 * Decode the chosen image in the browser and resize it to the 64x64 PNG
 * Minecraft needs. The browser decodes anything it can display (WebP, AVIF,
 * GIF, ...), which is far more than the server-side image library supports.
 */
async function fileToIconPng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");

    // Cover-fit: scale to fill 64x64 and center-crop.
    const scale = Math.max(64 / bitmap.width, 64 / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (64 - width) / 2, (64 - height) / 2, width, height);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("PNG export failed")),
        "image/png"
      )
    );
  } finally {
    bitmap.close();
  }
}

async function onIconUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadingIcon.value = true;
  try {
    const png = await fileToIconPng(file);
    const result = await $fetch<{ url: string }>(
      `/api/server/${id.value}/icon`,
      { method: "POST", body: png }
    );

    // The stored icon's URL goes into the config (applied on save) and is
    // what every preview renders from.
    if (form.value) form.value.ICON = result.url;

    toast.add({
      title: "Icon uploaded",
      description: "Save the configuration to apply it to the server.",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Upload failed",
      description: errorMessage(
        error,
        "The file could not be read as an image."
      ),
      color: "error",
    });
  } finally {
    uploadingIcon.value = false;
    input.value = "";
  }
}

async function onPackUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadingPack.value = true;
  try {
    const result = await $fetch<{ url: string; sha1: string }>(
      `/api/server/${id.value}/resource-pack`,
      { method: "POST", body: file }
    );
    if (form.value) {
      form.value.RESOURCE_PACK = result.url;
      form.value.RESOURCE_PACK_SHA1 = result.sha1;
    }
    toast.add({
      title: "Resource pack uploaded",
      description: "Save the configuration to apply it.",
      color: "success",
    });
  } catch (error) {
    toast.add({
      title: "Upload failed",
      description: errorMessage(
        error,
        "The file is not a valid .zip resource pack."
      ),
      color: "error",
    });
  } finally {
    uploadingPack.value = false;
    input.value = "";
  }
}

// --- Save ---------------------------------------------------------------------------

const saving = ref(false);

async function save() {
  if (!form.value) return;
  saving.value = true;
  try {
    // customEnv rides along untouched — it is edited on the Environment tab.
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
