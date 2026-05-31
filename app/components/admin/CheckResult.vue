<template>
  <div class="rounded-md bg-elevated/50 p-3 text-sm space-y-2">
    <p class="text-xs text-dimmed">
      Tested <span class="font-mono">{{ result.target }}</span> from the server's
      network.
    </p>

    <!-- DNS -->
    <div class="flex items-start gap-2">
      <UIcon :name="icon(result.dns.ok)" :class="color(result.dns.ok)" class="size-5 shrink-0" />
      <div>
        <p class="font-medium">DNS</p>
        <p class="text-muted">
          <template v-if="result.dns.ok">
            Resolves to <span class="font-mono">{{ result.dns.addresses.join(", ") }}</span>
          </template>
          <template v-else>{{ result.dns.error || "No record" }}</template>
        </p>
      </div>
    </div>

    <!-- Expected match -->
    <div v-if="result.expected" class="flex items-start gap-2">
      <UIcon :name="icon(result.expected.matches)" :class="color(result.expected.matches)" class="size-5 shrink-0" />
      <div>
        <p class="font-medium">Points here</p>
        <p class="text-muted">
          <template v-if="result.expected.matches">
            Matches <span class="font-mono">{{ result.expected.host }}</span>
          </template>
          <template v-else>
            Does not match <span class="font-mono">{{ result.expected.host }}</span>
            <span v-if="result.expected.addresses?.length">
              (<span class="font-mono">{{ result.expected.addresses.join(", ") }}</span>)
            </span>
          </template>
        </p>
      </div>
    </div>

    <!-- Port -->
    <div class="flex items-start gap-2">
      <UIcon :name="icon(result.tcp.ok)" :class="color(result.tcp.ok)" class="size-5 shrink-0" />
      <div>
        <p class="font-medium">Port {{ result.port }}</p>
        <p class="text-muted">
          <template v-if="result.tcp.ok">Reachable ({{ result.tcp.ms }}ms)</template>
          <template v-else>{{ result.tcp.error || "Unreachable" }}</template>
        </p>
      </div>
    </div>

    <!-- Minecraft ping (server mode only) -->
    <div v-if="result.mc" class="flex items-start gap-2">
      <UIcon :name="icon(result.mc.ok)" :class="color(result.mc.ok)" class="size-5 shrink-0" />
      <div>
        <p class="font-medium">Minecraft</p>
        <p class="text-muted">
          <template v-if="result.mc.ok">
            Responded
            <span v-if="result.mc.version">· {{ result.mc.version }}</span>
            <span v-if="result.mc.players">
              · {{ result.mc.players.online }}/{{ result.mc.players.max }}
            </span>
          </template>
          <template v-else>{{ result.mc.error || "No response" }}</template>
        </p>
      </div>
    </div>

    <p v-if="result.mode === 'wildcard'" class="text-xs text-dimmed">
      Wildcard probe: DNS + port reachable means the domain is ready. A Minecraft
      response only appears once a server exists on it.
    </p>
    <p v-if="!result.tcp.ok && result.dns.ok" class="text-xs text-dimmed">
      Note: this runs from inside the server's network. Some routers block
      reaching your own public IP from within (NAT hairpin) even when outside
      players can connect — confirm from an external network if unsure.
    </p>
  </div>
</template>

<script setup lang="ts">
interface CheckData {
  target: string;
  mode: "wildcard" | "server";
  port: number;
  dns: { ok: boolean; addresses: string[]; error?: string };
  expected?: { host: string; addresses: string[]; matches: boolean };
  tcp: { ok: boolean; ms?: number; error?: string };
  mc: {
    ok: boolean;
    version?: string;
    players?: { online: number; max: number };
    error?: string;
  } | null;
}

defineProps<{ result: CheckData }>();

const icon = (ok: boolean) =>
  ok ? "i-heroicons-check-circle-20-solid" : "i-heroicons-x-circle-20-solid";
const color = (ok: boolean) => (ok ? "text-success" : "text-error");
</script>
