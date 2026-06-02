<template>
  <UModal
    v-model:open="open"
    title="Passkeys"
    description="Sign in with Touch ID, Windows Hello or a security key instead of your password."
  >
    <template #body>
      <div class="space-y-3">
        <div v-if="!passkeys.length" class="text-sm text-muted text-center py-4">
          No passkeys yet. Add one to sign in without a password.
        </div>

        <div
          v-for="passkey in passkeys"
          :key="passkey.id"
          class="flex items-center justify-between gap-3 rounded-md border border-default px-3 py-2"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">
              {{ passkey.name || "Passkey" }}
            </p>
            <p class="text-xs text-dimmed">
              Added {{ new Date(passkey.createdAt).toLocaleDateString() }}
              <template v-if="passkey.backedUp"> · synced</template>
            </p>
          </div>
          <UButton
            color="error"
            variant="ghost"
            size="xs"
            icon="i-heroicons-trash"
            aria-label="Remove passkey"
            @click="removePasskey(passkey.id)"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end w-full">
        <UButton
          icon="i-heroicons-finger-print"
          :loading="adding"
          :disabled="!isSupported"
          @click="addPasskey"
        >
          Add passkey
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { errorMessage } from "~/utils/errors";

interface Passkey {
  id: string;
  name: string | null;
  backedUp: boolean;
  createdAt: number;
}

const open = defineModel<boolean>("open", { default: false });

const toast = useToast();
const { user } = useUserSession();
const { register, isSupported } = useWebAuthn();

const { data: passkeys, refresh } = useFetch<Passkey[]>("/api/me/passkeys", {
  key: "my-passkeys",
  default: () => [],
  // Only fetch while the modal is open (and the user is logged in).
  immediate: false,
});

watch(open, (value) => {
  if (value) refresh();
});

const adding = ref(false);

async function addPasskey() {
  if (!user.value) return;
  adding.value = true;
  try {
    await register({
      userName: user.value.email,
      displayName: user.value.name,
    });
    await refresh();
    toast.add({ title: "Passkey added", color: "success" });
  } catch (error) {
    const name = (error as Error)?.name;
    // Dismissing the browser dialog also rejects — not an error.
    if (name !== "NotAllowedError" && name !== "AbortError") {
      toast.add({
        title: "Could not add passkey",
        description: errorMessage(error, "Registering the passkey failed."),
        color: "error",
      });
    }
  } finally {
    adding.value = false;
  }
}

async function removePasskey(id: string) {
  try {
    await $fetch(`/api/me/passkeys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await refresh();
    toast.add({ title: "Passkey removed", color: "success" });
  } catch (error) {
    toast.add({
      title: "Could not remove passkey",
      description: errorMessage(error, "Removing the passkey failed."),
      color: "error",
    });
  }
}
</script>
