<template>
  <AuthShell
    title="Minecraft Server Manager"
    description="Sign in to manage your servers."
  >
    <div class="flex w-full flex-col gap-4">
      <UAlert
        v-if="errorBanner"
        icon="i-heroicons-exclamation-triangle"
        color="error"
        variant="soft"
        :description="errorBanner"
      />

      <!-- Password login -->
      <form class="flex flex-col gap-3" @submit.prevent="signInWithPassword">
        <UFormField label="Email">
          <UInput
            v-model="email"
            type="email"
            placeholder="you@example.com"
            autocomplete="username webauthn"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField label="Password">
          <UInput
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          :loading="loggingIn"
          :disabled="!email || !password"
        >
          Sign in
        </UButton>
      </form>

      <USeparator label="or" />

      <div class="flex flex-col gap-2">
        <UButton
          v-if="passkeysSupported"
          block
          color="neutral"
          variant="outline"
          icon="i-heroicons-finger-print"
          :loading="authenticating"
          @click="signInWithPasskey"
        >
          Sign in with a passkey
        </UButton>

        <UButton
          v-if="!providers || providers.microsoft"
          block
          color="neutral"
          variant="outline"
          icon="i-simple-icons-microsoft"
          @click="signInWithMicrosoft"
        >
          Sign in with Microsoft
        </UButton>
      </div>
    </div>
  </AuthShell>
</template>

<script setup lang="ts">
import { errorMessage } from "~/utils/errors";

definePageMeta({ layout: false });

useSeoMeta({ title: "Sign in · Minecraft Server Manager" });

const route = useRoute();
const toast = useToast();
const { fetch: refreshSession } = useUserSession();
const { authenticate, isSupported: passkeysSupported } = useWebAuthn();

const { data: providers } = useFetch("/api/auth/providers", {
  key: "auth-providers",
});

// --- Errors (form + OAuth redirects) ---------------------------------------

const formError = ref("");

/** OAuth failures land back here with ?error=... */
const OAUTH_ERRORS: Record<string, string> = {
  "no-account":
    "No account matches that Microsoft account's email. Ask an admin to create one for you first.",
  oauth: "Signing in with Microsoft failed. Please try again.",
};

const errorBanner = computed(
  () => formError.value || OAUTH_ERRORS[route.query.error as string] || ""
);

// --- Login methods ----------------------------------------------------------

const email = ref("");
const password = ref("");
const loggingIn = ref(false);
const authenticating = ref(false);

async function onLoggedIn() {
  await refreshSession();
  await navigateTo("/");
}

async function signInWithPassword() {
  loggingIn.value = true;
  formError.value = "";
  try {
    await $fetch("/api/auth/login", {
      method: "POST",
      body: { email: email.value.trim(), password: password.value },
    });
    await onLoggedIn();
  } catch (error) {
    formError.value = errorMessage(error, "Signing in failed.");
  } finally {
    loggingIn.value = false;
  }
}

async function signInWithPasskey() {
  authenticating.value = true;
  formError.value = "";
  try {
    // With an email typed in, the browser narrows to that user's passkeys;
    // otherwise it offers any discoverable credential for this site.
    await authenticate(email.value.trim() || undefined);
    await onLoggedIn();
  } catch (error) {
    // The browser dialog being dismissed also rejects — stay quiet then.
    const name = (error as Error)?.name;
    if (name !== "NotAllowedError" && name !== "AbortError") {
      toast.add({
        title: "Passkey sign-in failed",
        description: errorMessage(error, "Could not verify the passkey."),
        color: "error",
      });
    }
  } finally {
    authenticating.value = false;
  }
}

function signInWithMicrosoft() {
  // Full page navigation — the OAuth flow runs on the server.
  window.location.href = "/auth/microsoft";
}
</script>
