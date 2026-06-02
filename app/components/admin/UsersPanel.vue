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
            · {{ account.hasPassword ? "password" : "no password" }}
            · {{ account.passkeys }}
            {{ account.passkeys === 1 ? "passkey" : "passkeys" }}
          </p>
        </div>

        <div class="flex items-center gap-1 shrink-0">
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
          <UInput v-model="newUser.name" placeholder="Name" autocomplete="off" />
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
