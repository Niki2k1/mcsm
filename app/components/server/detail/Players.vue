<template>
  <div class="space-y-6">
    <UAlert
      v-if="booting"
      icon="i-heroicons-exclamation-triangle"
      color="warning"
      variant="soft"
      title="Server is starting"
      description="Changes are possible again once the server is up."
    />
    <UAlert
      v-else-if="data && !data.running"
      icon="i-heroicons-information-circle"
      color="neutral"
      variant="soft"
      title="Server is stopped"
      description="Whitelist and operator changes are saved now and apply on the next start."
    />

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Online players -->
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-semibold">
                Online players
                <UBadge
                  v-if="!data?.offline"
                  color="success"
                  variant="soft"
                  class="ms-1"
                  >{{ data?.online.length ?? 0 }}</UBadge
                >
              </h3>
              <p class="text-sm text-muted">Who is connected right now.</p>
            </div>
            <UButton
              icon="i-heroicons-arrow-path-20-solid"
              variant="ghost"
              color="neutral"
              size="xs"
              aria-label="Refresh players"
              :loading="status === 'pending'"
              @click="refresh()"
            />
          </div>
        </template>

        <div
          v-if="!data?.online.length"
          class="text-sm text-muted py-6 text-center"
        >
          Nobody is online right now.
        </div>

        <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div
            v-for="player in data.online"
            :key="player.name"
            class="flex items-center gap-3 rounded-lg ring-1 ring-default p-2"
          >
            <UAvatar
              :src="`/api/minecraft/${player.name}/skin`"
              :alt="player.name"
              size="sm"
            />
            <span class="text-sm font-medium flex-1 truncate">{{
              player.name
            }}</span>
            <UDropdownMenu v-if="canAct" :items="onlineActions(player.name)">
              <UButton
                icon="i-heroicons-ellipsis-vertical-20-solid"
                variant="ghost"
                color="neutral"
                size="xs"
                :aria-label="`Actions for ${player.name}`"
              />
            </UDropdownMenu>
          </div>
        </div>
      </UCard>

      <!-- Whitelist -->
      <UCard>
        <template #header>
          <div>
            <h3 class="font-semibold">Whitelist</h3>
            <p class="text-sm text-muted">
              Who may join when the whitelist is enabled.
            </p>
          </div>
        </template>

        <div class="space-y-2">
          <div
            v-for="player in data?.whitelist ?? []"
            :key="player.uuid || player.name"
            class="flex items-center gap-3 rounded-lg ring-1 ring-default p-2"
          >
            <UAvatar
              :src="
                player.name ? `/api/minecraft/${player.name}/skin` : undefined
              "
              :alt="player.name || 'Unknown player'"
              size="2xs"
            />
            <span v-if="player.name" class="text-sm flex-1 truncate">{{
              player.name
            }}</span>
            <span
              v-else
              class="text-sm flex-1 truncate text-muted font-mono"
              :title="player.uuid"
              >Unknown ({{ player.uuid?.slice(0, 8) }})</span
            >
            <UButton
              v-if="canAct"
              icon="i-heroicons-x-mark-20-solid"
              variant="ghost"
              color="error"
              size="xs"
              :disabled="booting"
              :aria-label="`Remove ${player.name} from whitelist`"
              @click="runAction('whitelist-remove', player.name, player.uuid)"
            />
          </div>

          <p
            v-if="!data?.whitelist?.length"
            class="text-sm text-muted py-2 text-center"
          >
            The whitelist is empty.
          </p>

          <UInput
            v-if="canAct"
            v-model.trim="newWhitelistName"
            placeholder="Add player to whitelist"
            autocomplete="off"
            class="w-full"
            :disabled="booting"
            @keyup.enter="addToWhitelist"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-heroicons-plus-20-solid"
                aria-label="Add to whitelist"
                :disabled="booting"
                @click="addToWhitelist"
              />
            </template>
          </UInput>

          <template v-if="canManage && data">
            <USeparator class="py-2" />
            <ServerDetailToggleRow
              :model-value="data.settings.enabled"
              label="Whitelist Enabled"
              description="Only whitelisted players can join the server."
              :disabled="booting || saving"
              @update:model-value="changeSetting('enabled', $event)"
            />
            <ServerDetailToggleRow
              :model-value="data.settings.enforce"
              label="Enforce Whitelist"
              description="Kick connected players that get removed from the whitelist. Restarts a running server."
              :disabled="booting || saving"
              @update:model-value="changeSetting('enforce', $event)"
            />
          </template>
        </div>
      </UCard>

      <!-- Operators -->
      <UCard>
        <template #header>
          <div>
            <h3 class="font-semibold">Operators</h3>
            <p class="text-sm text-muted">Players with full command access.</p>
          </div>
        </template>

        <div class="space-y-2">
          <div
            v-for="player in data?.ops ?? []"
            :key="player.uuid || player.name"
            class="flex items-center gap-3 rounded-lg ring-1 ring-default p-2"
          >
            <UAvatar
              :src="
                player.name ? `/api/minecraft/${player.name}/skin` : undefined
              "
              :alt="player.name || 'Unknown player'"
              size="2xs"
            />
            <span v-if="player.name" class="text-sm flex-1 truncate">{{
              player.name
            }}</span>
            <span
              v-else
              class="text-sm flex-1 truncate text-muted font-mono"
              :title="player.uuid"
              >Unknown ({{ player.uuid?.slice(0, 8) }})</span
            >
            <UButton
              v-if="canAct"
              icon="i-heroicons-x-mark-20-solid"
              variant="ghost"
              color="error"
              size="xs"
              :disabled="booting"
              :aria-label="`Remove operator ${player.name}`"
              @click="runAction('deop', player.name, player.uuid)"
            />
          </div>

          <p
            v-if="!data?.ops?.length"
            class="text-sm text-muted py-2 text-center"
          >
            No operators.
          </p>

          <UInput
            v-if="canAct"
            v-model.trim="opName"
            placeholder="Make player operator"
            autocomplete="off"
            class="w-full"
            :disabled="booting"
            @keyup.enter="addOperator"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-heroicons-plus-20-solid"
                aria-label="Make operator"
                :disabled="booting"
                @click="addOperator"
              />
            </template>
          </UInput>
        </div>
      </UCard>
    </div>

    <UModal
      v-model:open="enforceOpen"
      title="Restart the server?"
      description="Minecraft only reads this setting on startup, so the server is stopped, updated and started again. Connected players are disconnected."
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="enforceOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            :loading="saving"
            @click="saveSetting('enforce', !data?.settings.enforce)"
          >
            Restart and apply
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
type PlayerEntry = { name: string; uuid?: string };
type PlayersResponse = {
  running: boolean;
  offline: boolean;
  online: PlayerEntry[];
  ops: PlayerEntry[];
  whitelist: PlayerEntry[];
  settings: { enabled: boolean; enforce: boolean };
};

const { id, can } = useServerDetail();
const canAct = computed(() => can("operator"));
const canManage = computed(() => can("manager"));
const toast = useToast();

const { data, refresh, status } = useFetch<PlayersResponse>(
  () => `/api/server/${id.value}/players`,
  { retry: false }
);

// Running but RCON not answering yet — a file edit now would be overwritten
// by the server once it has loaded the lists.
const booting = computed(() => !!data.value?.running && data.value.offline);

// Refresh the online list every 30s while the tab is open.
let interval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  interval = setInterval(refresh, 30_000);
});
onUnmounted(() => {
  if (interval) clearInterval(interval);
});

// --- Actions -------------------------------------------------------------------

type PlayerAction =
  | "op"
  | "deop"
  | "whitelist-add"
  | "whitelist-remove"
  | "kick";

const ACTION_LABELS: Record<PlayerAction, string> = {
  op: "Made operator",
  deop: "Operator removed",
  "whitelist-add": "Added to whitelist",
  "whitelist-remove": "Removed from whitelist",
  kick: "Player kicked",
};

async function runAction(action: PlayerAction, name: string, uuid?: string) {
  if (!name && !uuid) return;
  try {
    const { response } = await $fetch<{ response: string }>(
      `/api/server/${id.value}/players/action`,
      { method: "POST", body: { action, name: name || undefined, uuid } }
    );
    toast.add({
      title: ACTION_LABELS[action],
      description: response || `${action} ${name || uuid}`,
      color: "success",
    });
    await refresh();
  } catch (error) {
    const { statusCode, statusMessage } = (error ?? {}) as {
      statusCode?: number;
      statusMessage?: string;
    };
    toast.add({
      title: "Action failed",
      description:
        statusCode === 409
          ? statusMessage || "The server is not running."
          : statusCode === 404
            ? `Player “${name}” not found.`
            : "The command could not be executed.",
      color: "error",
    });
  }
}

function onlineActions(name: string) {
  return [
    {
      label: "Make operator",
      icon: "i-heroicons-shield-check-20-solid",
      onSelect: () => runAction("op", name),
    },
    {
      label: "Remove operator",
      icon: "i-heroicons-shield-exclamation-20-solid",
      onSelect: () => runAction("deop", name),
    },
    {
      label: "Add to whitelist",
      icon: "i-heroicons-check-circle-20-solid",
      onSelect: () => runAction("whitelist-add", name),
    },
    { type: "separator" as const },
    {
      label: "Kick",
      icon: "i-heroicons-arrow-right-start-on-rectangle-20-solid",
      color: "error" as const,
      onSelect: () => runAction("kick", name),
    },
  ];
}

// --- Add forms -------------------------------------------------------------------

const newWhitelistName = ref("");
const opName = ref("");

async function addToWhitelist() {
  const name = newWhitelistName.value;
  if (!name) return;
  await runAction("whitelist-add", name);
  newWhitelistName.value = "";
}

async function addOperator() {
  const name = opName.value;
  if (!name) return;
  await runAction("op", name);
  opName.value = "";
}

// --- Whitelist settings ----------------------------------------------------------

type WhitelistSetting = "enabled" | "enforce";

const saving = ref(false);
const enforceOpen = ref(false);

function changeSetting(setting: WhitelistSetting, value: boolean) {
  // Enforcement needs a restart of a running server — ask first.
  if (setting === "enforce" && data.value?.running) {
    enforceOpen.value = true;
    return;
  }
  saveSetting(setting, value);
}

async function saveSetting(setting: WhitelistSetting, value: boolean) {
  saving.value = true;
  try {
    const { restarted } = await $fetch<{ restarted: boolean }>(
      `/api/server/${id.value}/players/settings`,
      { method: "POST", body: { setting, value } }
    );
    toast.add({
      title: `${setting === "enabled" ? "Whitelist" : "Enforcement"} ${value ? "enabled" : "disabled"}`,
      description: restarted
        ? "The server is starting again."
        : data.value?.running
          ? undefined
          : "Applies on the next start.",
      color: "success",
    });
    enforceOpen.value = false;
    await refresh();
  } catch {
    toast.add({
      title: "Could not change the setting",
      color: "error",
    });
  } finally {
    saving.value = false;
  }
}
</script>
