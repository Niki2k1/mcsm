<template>
  <div class="flex flex-col gap-2">
    <UAlert
      v-if="server && !server.running"
      icon="i-heroicons-exclamation-triangle"
      color="warning"
      variant="soft"
      title="Server is stopped"
      description="Logs from the last run are shown below. Start the server to run commands."
    />

    <ServerTerminal :server-id="id" class="h-[max(24rem,calc(100dvh-28rem))]" />

    <p class="shrink-0 text-xs text-muted">
      Streaming the server console. Type a command and press Enter to run it
      via RCON (the server must be running).
    </p>
  </div>
</template>

<script setup lang="ts">
const { id, server } = useServerDetail();
</script>
