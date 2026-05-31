<template>
  <UModal
    v-model:open="state.open"
    :title="`Server Icon — ${state.server?.name ?? ''}`"
    description="Shown next to your server in the Minecraft multiplayer list."
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex items-center gap-4">
          <div
            class="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-default bg-elevated"
          >
            <img
              v-show="hasIcon"
              :src="iconUrl"
              alt="Server icon"
              class="size-full object-cover"
              style="image-rendering: pixelated"
              @load="hasIcon = true"
              @error="hasIcon = false"
            />
            <UIcon
              v-show="!hasIcon"
              name="i-heroicons-photo"
              class="size-8 text-muted"
            />
          </div>

          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                icon="i-heroicons-arrow-up-tray-20-solid"
                size="sm"
                :loading="uploading"
                :label="hasIcon ? 'Change' : 'Upload'"
                @click="pickFile"
              />
              <UButton
                v-if="hasIcon"
                icon="i-heroicons-trash-20-solid"
                color="error"
                variant="subtle"
                size="sm"
                label="Remove"
                :disabled="uploading"
                @click="removeIcon"
              />
            </div>
            <p class="text-xs text-muted">
              A 64×64 PNG works best. Larger images are resized and cropped.
            </p>
          </div>
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-heroicons-exclamation-triangle-20-solid"
          :title="errorMessage"
        />

        <p class="text-xs text-muted">
          Restart the server for a new icon to appear in the multiplayer list.
        </p>

        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onFileChange"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { state, close } = useIconModal();

// Mirror the server-side cap so we can fail fast with a friendly message.
const MAX_BYTES = 5 * 1024 * 1024;

const version = ref(Date.now());
const hasIcon = ref(false);
const uploading = ref(false);
const errorMessage = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

// The cache-busting `v` param forces a re-fetch after an upload or removal.
const iconUrl = computed(() =>
  state.value.server
    ? `/api/server/${state.value.server.id}/icon?v=${version.value}`
    : ""
);

// Reset transient state each time the modal is opened for a server.
watch(
  () => state.value.open,
  (open) => {
    if (open) {
      version.value = Date.now();
      errorMessage.value = null;
    }
  }
);

function pickFile() {
  fileInput.value?.click();
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  const server = state.value.server;
  if (!file || !server) return;

  errorMessage.value = null;

  if (!file.type.startsWith("image/")) {
    errorMessage.value = "Please choose an image file";
    input.value = "";
    return;
  }
  if (file.size > MAX_BYTES) {
    errorMessage.value = "Image is too large (max 5MB)";
    input.value = "";
    return;
  }

  uploading.value = true;
  try {
    const body = new FormData();
    body.append("icon", file);
    await $fetch(`/api/server/${server.id}/icon`, { method: "POST", body });
    version.value = Date.now();
    hasIcon.value = true;
  } catch (err: any) {
    errorMessage.value =
      err?.data?.statusMessage ?? err?.statusMessage ?? "Failed to upload icon";
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

async function removeIcon() {
  const server = state.value.server;
  if (!server) return;

  errorMessage.value = null;
  uploading.value = true;
  try {
    await $fetch(`/api/server/${server.id}/icon`, { method: "DELETE" });
    hasIcon.value = false;
    version.value = Date.now();
  } catch (err: any) {
    errorMessage.value =
      err?.data?.statusMessage ?? err?.statusMessage ?? "Failed to remove icon";
  } finally {
    uploading.value = false;
  }
}
</script>
