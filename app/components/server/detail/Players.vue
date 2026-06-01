<template>
  <div class="space-y-6">
    <UAlert
      v-if="data?.offline"
      icon="i-heroicons-exclamation-triangle"
      color="warning"
      variant="soft"
      title="Server is not reachable"
      description="Live player management needs a running server. Showing the configured baseline instead."
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
            <UDropdownMenu :items="onlineActions(player.name)">
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

      <!-- Whitelist (live) -->
      <UCard>
        <template #header>
          <div>
            <h3 class="font-semibold">Whitelist</h3>
            <p class="text-sm text-muted">
              Changes apply to the running server immediately.
            </p>
          </div>
        </template>

        <div class="space-y-2">
          <div
            v-for="player in data?.whitelist ?? []"
            :key="player.name"
            class="flex items-center gap-3 rounded-lg ring-1 ring-default p-2"
          >
            <UAvatar
              :src="`/api/minecraft/${player.name}/skin`"
              :alt="player.name"
              size="2xs"
            />
            <span class="text-sm flex-1 truncate">{{ player.name }}</span>
            <UButton
              icon="i-heroicons-x-mark-20-solid"
              variant="ghost"
              color="error"
              size="xs"
              :disabled="data?.offline"
              :aria-label="`Remove ${player.name} from whitelist`"
              @click="runAction('whitelist-remove', player.name)"
            />
          </div>

          <p
            v-if="!data?.whitelist?.length"
            class="text-sm text-muted py-2 text-center"
          >
            The whitelist is empty.
          </p>

          <UInput
            v-model.trim="newWhitelistName"
            placeholder="Add player to whitelist"
            autocomplete="off"
            class="w-full"
            :disabled="data?.offline"
            @keyup.enter="addToWhitelist"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="link"
                icon="i-heroicons-plus-20-solid"
                aria-label="Add to whitelist"
                :disabled="data?.offline"
                @click="addToWhitelist"
              />
            </template>
          </UInput>
        </div>
      </UCard>

      <!-- Operators -->
      <UCard>
        <template #header>
          <div>
            <h3 class="font-semibold">Operators</h3>
            <p class="text-sm text-muted">
              Op or de-op players on the running server by name.
            </p>
          </div>
        </template>

        <div class="space-y-2">
          <div
            v-for="player in data?.ops ?? []"
            :key="player.name"
            class="flex items-center gap-3 rounded-lg ring-1 ring-default p-2"
          >
            <UAvatar
              :src="`/api/minecraft/${player.name}/skin`"
              :alt="player.name"
              size="2xs"
            />
            <span class="text-sm flex-1 truncate">{{ player.name }}</span>
            <UBadge color="neutral" variant="soft" size="sm">baseline</UBadge>
          </div>

          <p v-if="!data?.ops?.length" class="text-sm text-muted py-2 text-center">
            No baseline operators configured.
          </p>

          <UInput
            v-model.trim="opName"
            placeholder="Player name"
            autocomplete="off"
            class="w-full"
            :disabled="data?.offline"
            @keyup.enter="runAction('op', opName).then(() => (opName = ''))"
          />
          <div class="flex gap-2">
            <UButton
              variant="soft"
              size="sm"
              :disabled="data?.offline || !opName"
              @click="runAction('op', opName).then(() => (opName = ''))"
            >
              Op
            </UButton>
            <UButton
              variant="soft"
              color="warning"
              size="sm"
              :disabled="data?.offline || !opName"
              @click="runAction('deop', opName).then(() => (opName = ''))"
            >
              De-op
            </UButton>
          </div>

          <p class="text-xs text-muted pt-1">
            The list above is the configured baseline (Minecraft can't report
            live operators over RCON). Live changes still take effect on the
            server.
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
type PlayerEntry = { name: string; uuid?: string };
type PlayersResponse = {
  offline: boolean;
  online: PlayerEntry[];
  ops: PlayerEntry[];
  whitelist: PlayerEntry[];
};

const { id } = useServerDetail();
const toast = useToast();

const { data, refresh, status } = useFetch<PlayersResponse>(
  () => `/api/server/${id.value}/players`,
  { retry: false }
);

// Refresh the online list every 30s while the tab is open.
let interval: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  interval = setInterval(refresh, 30_000);
});
onUnmounted(() => {
  if (interval) clearInterval(interval);
});

// --- Actions -------------------------------------------------------------------

type PlayerAction = "op" | "deop" | "whitelist-add" | "whitelist-remove" | "kick";

const ACTION_LABELS: Record<PlayerAction, string> = {
  op: "Made operator",
  deop: "Operator removed",
  "whitelist-add": "Added to whitelist",
  "whitelist-remove": "Removed from whitelist",
  kick: "Player kicked",
};

async function runAction(action: PlayerAction, name: string) {
  if (!name) return;
  try {
    const { response } = await $fetch<{ response: string }>(
      `/api/server/${id.value}/players/action`,
      { method: "POST", body: { action, name } }
    );
    toast.add({
      title: ACTION_LABELS[action],
      description: response || `${action} ${name}`,
      color: "success",
    });
    await refresh();
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    toast.add({
      title: "Action failed",
      description:
        statusCode === 409
          ? "The server is not running."
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

// --- Whitelist add ---------------------------------------------------------------

const newWhitelistName = ref("");
const opName = ref("");

async function addToWhitelist() {
  const name = newWhitelistName.value;
  if (!name) return;
  await runAction("whitelist-add", name);
  newWhitelistName.value = "";
}
</script>
