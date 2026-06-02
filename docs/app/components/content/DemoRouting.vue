<template>
  <div class="not-prose space-y-4 rounded-lg border border-default bg-default p-4">
    <!-- Domain → container rows -->
    <div class="space-y-2">
      <div
        v-for="server in servers"
        :key="server.name"
        class="rounded-md border border-default bg-elevated/50 px-3 py-2 transition"
        :class="{ 'ring-2 ring-primary': server.isNew }"
      >
        <div class="flex items-center gap-2">
          <!-- What players type -->
          <code class="truncate text-sm font-medium text-highlighted">
            {{ server.name }}.mc.example.com
          </code>
          <UButton
            icon="i-lucide-copy"
            size="xs"
            color="neutral"
            variant="ghost"
            square
            :aria-label="`Copy ${server.name}.mc.example.com`"
            @click="copy(server)"
          />

          <!-- Routed to -->
          <span class="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted">
            <UIcon name="i-lucide-move-right" class="size-4 text-dimmed" />
            <UIcon name="i-lucide-container" class="size-3.5" />
            mc-{{ server.name }}
          </span>
        </div>

        <!-- The mechanism: one Docker label, no config files -->
        <p v-if="server.isNew" class="mt-1.5 truncate font-mono text-[11px] text-primary">
          + infrarust.domains="{{ server.name }}.mc.example.com" · infrarust.port="25565"
        </p>
      </div>
    </div>

    <!-- Convergence point -->
    <div
      class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-md border border-dashed border-accented px-3 py-2 text-center text-xs text-muted"
    >
      <UIcon name="i-lucide-route" class="size-4 text-primary" />
      <span>
        All domains share <code class="font-semibold text-highlighted">port 25565</code> —
        Infrarust routes each one to its container by Docker label.
      </span>
    </div>

    <!-- Add your own -->
    <form class="flex gap-2" @submit.prevent="add">
      <UInput
        v-model="newName"
        placeholder="skyblock"
        size="sm"
        class="flex-1 font-mono"
        :ui="{ base: 'lowercase' }"
        aria-label="New server name"
      />
      <UButton type="submit" size="sm" icon="i-lucide-plus" :disabled="!cleanName">
        Add server
      </UButton>
    </form>

    <!-- The pain that's gone -->
    <p class="text-xs text-dimmed">
      <span class="text-muted line-through">play.example.com:25565</span>
      <span class="mx-1 text-muted line-through">:25566</span>
      <span class="mr-1 text-muted line-through">:25567</span>
      No port forwarding per server, no proxy config files, no ports for players
      to remember.
    </p>
  </div>
</template>

<script setup lang="ts">
// Interactive demo of MCSM's label-based routing: every server gets its own
// subdomain through one shared port. In the real stack, MCSM sets the
// `infrarust.*` labels on each container and Infrarust picks them up live —
// there is no proxy config to write.

type DemoServer = { name: string; isNew?: boolean };

const servers = ref<DemoServer[]>([
  { name: "survival" },
  { name: "creative" },
  { name: "modpack" },
]);

const newName = ref("");
const toast = useToast();

/** Subdomain-safe version of whatever was typed. */
const cleanName = computed(() =>
  newName.value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
);

function add() {
  const name = cleanName.value;
  if (!name) return;
  if (servers.value.some((server) => server.name === name)) {
    toast.add({ title: `${name}.mc.example.com already exists`, color: "warning" });
    return;
  }
  // Mark only the latest addition as new so the label callout moves with it.
  for (const server of servers.value) server.isNew = false;
  servers.value.push({ name, isNew: true });
  newName.value = "";
  toast.add({
    title: `${name}.mc.example.com is live`,
    description: "In MCSM, Infrarust starts routing the moment the container gets its labels.",
    color: "success",
  });
}

async function copy(server: DemoServer) {
  try {
    await navigator.clipboard.writeText(`${server.name}.mc.example.com`);
    toast.add({ title: "Address copied", color: "success" });
  } catch {
    // Clipboard can be unavailable (permissions, http) — the demo doesn't care.
  }
}
</script>
