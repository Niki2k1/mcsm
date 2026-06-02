<template>
  <!--
    MCSM architecture, drawn with Nuxt UI design tokens so it follows the
    docs theme (light/dark mode, primary color) automatically.

    Left lane:  how you manage servers (Browser → MCSM → Docker).
    Right lane: how players reach them (Game client → Infrarust → container).
  -->
  <div class="not-prose rounded-lg border border-default bg-default p-4 sm:p-6">
    <div class="grid gap-x-6 gap-y-8 sm:grid-cols-2 sm:gap-y-0">
      <!-- Management lane -->
      <div class="flex flex-col">
        <DiagramNode
          icon="i-lucide-monitor"
          title="Your browser"
          subtitle="The MCSM dashboard"
        />
        <DiagramArrow label="create wizard · console · backups" />
        <DiagramNode
          icon="i-lucide-layout-dashboard"
          title="MCSM"
          subtitle="Nuxt + Nitro, self-hosted"
          accent
        />
        <DiagramArrow label="Docker Engine API — create, start, label" />
      </div>

      <!-- Gameplay lane -->
      <div class="flex flex-col">
        <DiagramNode
          icon="i-lucide-gamepad-2"
          title="Game clients"
          subtitle="survival.mc.example.com"
        />
        <DiagramArrow label="Minecraft protocol · port 25565" />
        <DiagramNode
          icon="i-lucide-route"
          title="Infrarust proxy"
          subtitle="Routes each domain to its container"
          accent
        />
        <DiagramArrow label="discovers containers by their labels" />
      </div>
    </div>

    <!-- Docker daemon spanning both lanes -->
    <div class="rounded-lg border border-dashed border-accented bg-elevated/50 p-4">
      <div class="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
        <UIcon name="i-lucide-container" class="size-4" />
        Docker daemon
      </div>

      <div class="grid gap-3 sm:grid-cols-3">
        <div
          v-for="server in servers"
          :key="server.name"
          class="flex items-center gap-3 rounded-md border border-default bg-default p-3"
        >
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 font-[Monocraft] text-sm text-primary"
          >
            {{ server.initial }}
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ server.name }}
            </p>
            <p class="truncate text-xs text-muted">itzg/minecraft-server</p>
          </div>
          <span class="ml-auto size-2 shrink-0 rounded-full bg-primary" />
        </div>
      </div>

      <p class="mt-3 text-xs text-dimmed">
        Each server is an ordinary labeled container with its world on a named
        volume — the full config lives in the
        <code class="text-xs">mcsm.config</code> label.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const servers = [
  { name: "survival", initial: "S" },
  { name: "creative", initial: "C" },
  { name: "modpack", initial: "M" },
];
</script>
