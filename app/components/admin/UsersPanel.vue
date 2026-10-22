<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Users</h2>
      <p class="text-sm text-muted">
        Accounts that can sign in to this dashboard. Users sign in with their
        password, a passkey, or a Microsoft account with a matching email.
      </p>
    </template>

    <div class="space-y-2">
      <div
        v-for="account in users"
        :key="account.id"
        class="flex items-center justify-between gap-3 rounded-md border border-default px-3 py-2"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="font-medium truncate">{{ account.name }}</p>
            <UBadge
              v-if="account.admin"
              label="Admin"
              variant="subtle"
              size="sm"
            />
            <UBadge
              v-if="account.id === user?.id"
              label="You"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="text-xs text-dimmed truncate">
            {{ account.email }}
            · {{ account.hasPassword ? "password" : "no password" }} ·
            {{ account.passkeys }}
            {{ account.passkeys === 1 ? "passkey" : "passkeys" }}
            ·
            {{
              account.admin
                ? "all servers"
                : `${account.servers} ${account.servers === 1 ? "server" : "servers"}`
            }}
          </p>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <UButton
            v-if="!account.admin"
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-heroicons-server-stack"
            label="Server access"
            @click="askAccess(account)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-heroicons-key"
            label="Reset password"
            @click="askResetPassword(account)"
          />
          <UButton
            v-if="account.id !== user?.id"
            color="neutral"
            variant="ghost"
            size="xs"
            :icon="
              account.admin
                ? 'i-heroicons-arrow-down-circle'
                : 'i-heroicons-arrow-up-circle'
            "
            :label="account.admin ? 'Remove admin' : 'Make admin'"
            @click="toggleAdmin(account)"
          />
          <UButton
            v-if="account.id !== user?.id"
            color="error"
            variant="ghost"
            size="xs"
            icon="i-heroicons-trash"
            aria-label="Delete user"
            @click="askDelete(account)"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <form class="space-y-3" @submit.prevent="createUser">
        <div class="grid gap-2 sm:grid-cols-3">
          <UInput
            v-model="newUser.name"
            placeholder="Name"
            autocomplete="off"
          />
          <UInput
            v-model="newUser.email"
            type="email"
            placeholder="email@example.com"
            autocomplete="off"
          />
          <UInput
            v-model="newUser.password"
            type="password"
            placeholder="Password (optional)"
            autocomplete="new-password"
          />
        </div>
        <div class="flex items-center justify-between">
          <UCheckbox v-model="newUser.admin" label="Admin" />
          <UButton
            type="submit"
            :disabled="!newUser.name || !newUser.email"
            :loading="creating"
          >
            Add user
          </UButton>
        </div>
      </form>
    </template>

    <!-- Delete confirmation -->
    <UModal v-model:open="deleteOpen" title="Delete user">
      <template #body>
        <p class="text-sm">
          Delete <strong>{{ pending?.name }}</strong> ({{ pending?.email }})?
          Their passkeys are removed too. This cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="deleteOpen = false">
            Cancel
          </UButton>
          <UButton color="error" :loading="deleting" @click="deleteUser">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Per-server access -->
    <UModal
      v-model:open="accessOpen"
      :title="`Server access for ${pending?.name ?? ''}`"
      description="Admins can always manage every server. Everyone else only sees the servers listed here."
    >
      <template #body>
        <div v-if="loadingAccess" class="py-6 text-center text-muted">
          <UIcon name="i-heroicons-arrow-path-20-solid" class="animate-spin" />
        </div>
        <p
          v-else-if="!servers?.length"
          class="text-sm text-muted py-4 text-center"
        >
          There are no servers yet.
        </p>
        <div v-else class="space-y-2">
          <div
            v-for="server in servers"
            :key="server.volume ?? server.id"
            class="flex items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">{{ server.name }}</p>
              <p class="text-xs text-dimmed font-mono truncate">
                {{ server.domain }}
              </p>
            </div>
            <USelect
              v-if="server.volume"
              v-model="draft[server.volume]"
              :items="roleOptions"
              class="w-36 shrink-0"
            />
          </div>
          <dl class="pt-3 text-xs text-muted space-y-1">
            <div>
              <strong>Viewer:</strong> overview, players, analytics, map.
            </div>
            <div>
              <strong>Operator:</strong> + start/stop, console, player actions.
            </div>
            <div>
              <strong>Manager:</strong> + configuration, files, mods, backups,
              world and settings. Only admins can create, duplicate or delete
              servers.
            </div>
          </dl>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="accessOpen = false">
            Cancel
          </UButton>
          <UButton
            :loading="savingAccess"
            :disabled="loadingAccess"
            @click="saveAccess"
          >
            Save
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Password reset -->
    <UModal v-model:open="resetOpen" title="Reset password">
      <template #body>
        <UFormField
          :label="`New password for ${pending?.name}`"
          help="At least 8 characters."
        >
          <UInput
            v-model="newPassword"
            type="password"
            placeholder="••••••••"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="resetOpen = false">
            Cancel
          </UButton>
          <UButton
            :disabled="newPassword.length < 8"
            :loading="resetting"
            @click="resetPassword"
          >
            Set password
          </UButton>
        </div>
      </template>
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
import { errorMessage } from "~/utils/errors";

interface Account {
  id: number;
  email: string;
  name: string;
  admin: boolean;
  createdAt: number;
  hasPassword: boolean;
  passkeys: number;
  servers: number;
}

interface Grant {
  volume: string;
  role: ServerRole;
}

interface ServerOption {
  id: string;
  name: string;
  domain: string;
  volume: string | null;
}

const toast = useToast();
const { user } = useUserSession();

const { data: users, refresh } = useFetch<Account[]>("/api/users", {
  key: "admin-users",
  default: () => [],
});

// --- Create -----------------------------------------------------------------

const newUser = reactive({ name: "", email: "", password: "", admin: false });
const creating = ref(false);

async function createUser() {
  creating.value = true;
  try {
    await $fetch("/api/users", {
      method: "POST",
      body: {
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password || undefined,
        admin: newUser.admin,
      },
    });
    Object.assign(newUser, { name: "", email: "", password: "", admin: false });
    await refresh();
    toast.add({ title: "User created", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not create user",
      description: errorMessage(error, "Creating the user failed."),
      color: "error",
    });
  } finally {
    creating.value = false;
  }
}

// --- Admin toggle -----------------------------------------------------------

async function toggleAdmin(account: Account) {
  try {
    await $fetch(`/api/users/${account.id}`, {
      method: "PATCH",
      body: { admin: !account.admin },
    });
    await refresh();
  } catch (error) {
    toast.add({
      title: "Could not update user",
      description: errorMessage(error, "Updating the user failed."),
      color: "error",
    });
  }
}

// --- Delete -----------------------------------------------------------------

const deleteOpen = ref(false);
const deleting = ref(false);
const pending = ref<Account | null>(null);

function askDelete(account: Account) {
  pending.value = account;
  deleteOpen.value = true;
}

async function deleteUser() {
  if (!pending.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/users/${pending.value.id}`, { method: "DELETE" });
    deleteOpen.value = false;
    await refresh();
    toast.add({ title: "User deleted", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not delete user",
      description: errorMessage(error, "Deleting the user failed."),
      color: "error",
    });
  } finally {
    deleting.value = false;
  }
}

// --- Server access ----------------------------------------------------------

const NO_ACCESS = "none";
const roleOptions = [
  { label: "No access", value: NO_ACCESS },
  { label: "Viewer", value: "viewer" },
  { label: "Operator", value: "operator" },
  { label: "Manager", value: "manager" },
];

const accessOpen = ref(false);
const loadingAccess = ref(false);
const savingAccess = ref(false);
const draft = ref<Record<string, string>>({});
const servers = ref<ServerOption[]>([]);
// Grants for worlds whose container is gone (deleted, volume kept) don't show
// up in the list, but must survive a save so the user regains access if the
// server is recreated.
let hiddenGrants: Grant[] = [];

async function askAccess(account: Account) {
  pending.value = account;
  accessOpen.value = true;
  loadingAccess.value = true;
  try {
    const [serverList, grants] = await Promise.all([
      $fetch<ServerOption[]>("/api/server"),
      $fetch<Grant[]>(`/api/users/${account.id}/access`),
    ]);
    servers.value = serverList;
    const byVolume = new Map(grants.map((g) => [g.volume, g.role]));
    draft.value = Object.fromEntries(
      serverList
        .filter((server) => server.volume)
        .map((server) => [
          server.volume!,
          byVolume.get(server.volume!) ?? NO_ACCESS,
        ])
    );
    hiddenGrants = grants.filter((g) => !(g.volume in draft.value));
  } catch (error) {
    accessOpen.value = false;
    toast.add({
      title: "Could not load server access",
      description: errorMessage(error, "Loading the grants failed."),
      color: "error",
    });
  } finally {
    loadingAccess.value = false;
  }
}

async function saveAccess() {
  if (!pending.value) return;
  savingAccess.value = true;
  try {
    const grants: Grant[] = [
      ...hiddenGrants,
      ...Object.entries(draft.value)
        .filter(([, role]) => role !== NO_ACCESS)
        .map(([volume, role]) => ({ volume, role: role as ServerRole })),
    ];
    await $fetch(`/api/users/${pending.value.id}/access`, {
      method: "PUT",
      body: { grants },
    });
    accessOpen.value = false;
    await refresh();
    toast.add({ title: "Server access updated", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not update server access",
      description: errorMessage(error, "Saving the grants failed."),
      color: "error",
    });
  } finally {
    savingAccess.value = false;
  }
}

// --- Password reset ---------------------------------------------------------

const resetOpen = ref(false);
const resetting = ref(false);
const newPassword = ref("");

function askResetPassword(account: Account) {
  pending.value = account;
  newPassword.value = "";
  resetOpen.value = true;
}

async function resetPassword() {
  if (!pending.value) return;
  resetting.value = true;
  try {
    await $fetch(`/api/users/${pending.value.id}`, {
      method: "PATCH",
      body: { password: newPassword.value },
    });
    resetOpen.value = false;
    await refresh();
    toast.add({ title: "Password updated", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not update password",
      description: errorMessage(error, "Updating the password failed."),
      color: "error",
    });
  } finally {
    resetting.value = false;
  }
}
</script>
