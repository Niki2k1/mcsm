<template>
  <div class="not-prose space-y-3 rounded-lg border border-default bg-default p-4">
    <!-- Toolbar -->
    <div
      class="flex flex-wrap items-center gap-1 rounded-md border border-default bg-elevated/50 p-1"
    >
      <UButton
        v-for="format in MOTD_FORMATS"
        :key="format.code"
        :icon="formatIcons[format.code]"
        color="neutral"
        variant="ghost"
        size="xs"
        square
        :aria-label="`${format.name} (§${format.code})`"
        :title="`${format.name} (§${format.code})`"
        @click="insert(`§${format.code}`)"
      />

      <USeparator orientation="vertical" class="mx-0.5 h-5" />

      <!-- Color picker -->
      <UPopover>
        <UButton color="neutral" variant="ghost" size="xs" square aria-label="Text color">
          <span
            class="size-4 rounded-sm ring-1 ring-inset ring-white/15"
            :style="{ backgroundColor: lastColor }"
          />
        </UButton>

        <template #content>
          <div class="w-56 p-2">
            <div class="grid grid-cols-8 gap-1">
              <button
                v-for="color in MOTD_COLORS"
                :key="color.code"
                type="button"
                class="size-5 rounded-sm ring-1 ring-inset ring-white/10 transition hover:scale-110"
                :style="{ backgroundColor: color.hex }"
                :title="`${color.name} (§${color.code})`"
                @click="insertColor(color)"
              />
            </div>

            <USeparator class="my-2" />

            <div class="flex items-center gap-2">
              <input
                v-model="customHex"
                type="color"
                aria-label="Custom hex color"
                class="size-7 shrink-0 cursor-pointer rounded border border-default bg-transparent p-0"
              />
              <UButton size="xs" color="neutral" variant="soft" @click="insertCustomHex">
                Insert hex color
              </UButton>
            </div>
            <p class="mt-1 text-[11px] text-dimmed">Custom color (1.16+)</p>
          </div>
        </template>
      </UPopover>

      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-rotate-ccw"
        aria-label="Insert reset code"
        title="Reset formatting (§r)"
        square
        @click="insert('§r')"
      />

      <div class="flex-1" />

      <!-- Presets -->
      <UButton
        v-for="preset in presets"
        :key="preset.name"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="motd = preset.motd"
      >
        {{ preset.name }}
      </UButton>
    </div>

    <!-- Raw §-coded source -->
    <UTextarea
      ref="sourceInput"
      v-model="motd"
      :rows="2"
      autoresize
      class="w-full font-mono"
      placeholder="§aType your MOTD here — §6§lwith color codes!"
    />

    <!-- Live in-game preview -->
    <div>
      <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-dimmed">
        Live preview — exactly what players see
      </p>
      <DemoServerList name="My Awesome Server" :motd="motd" :players-online="7" :players-max="20" :latency="31" />
    </div>
  </div>
</template>

<script setup lang="ts">
// Interactive version of MCSM's MOTD editor: type legacy `§` codes (or use the
// toolbar) and watch the in-game server list entry update live. The real
// editor in MCSM is a rich-text editor that reads/writes the same format.
import { MOTD_COLORS, MOTD_FORMATS, type MotdColor } from "~/utils/motd";

const motd = ref(
  "§b§lMy Awesome Server §r§7[§a1.21§7]\n§6✦ §eSkyblock §7| §d§kAA§r §5Mini-games §d§kAA"
);

const formatIcons: Record<string, string> = {
  l: "i-lucide-bold",
  o: "i-lucide-italic",
  n: "i-lucide-underline",
  m: "i-lucide-strikethrough",
  k: "i-lucide-sparkles",
};

const presets = [
  {
    name: "Survival",
    motd: "§2§lEmerald SMP §r§8» §7Vanilla survival, §fno claims\n§7Season §e3 §7— §aJoin us!",
  },
  {
    name: "Rainbow",
    motd: "§x§f§f§5§5§5§5R§x§f§f§a§a§5§5a§x§f§f§f§f§5§5i§x§5§5§f§f§5§5n§x§5§5§f§f§f§fb§x§5§5§5§5§f§fo§x§a§a§5§5§f§fw §fhex colors §7(1.16+)",
  },
  {
    name: "Chaos",
    motd: "§4§lHARDCORE §r§c☠ §fOne life. No second chances.\n§k##§r §7Enter at your own risk §k##",
  },
];

// --- Toolbar code insertion ---------------------------------------------------

const sourceInput = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>("sourceInput");
const lastColor = ref("#55FF55");
const customHex = ref("#ff7f50");

/** Insert a code at the cursor position (or append at the end). */
function insert(code: string) {
  const textarea = sourceInput.value?.textareaRef;
  const pos = textarea?.selectionStart ?? motd.value.length;
  motd.value = motd.value.slice(0, pos) + code + motd.value.slice(pos);
  // Restore focus behind the inserted code.
  nextTick(() => {
    textarea?.focus();
    textarea?.setSelectionRange(pos + code.length, pos + code.length);
  });
}

function insertColor(color: MotdColor) {
  lastColor.value = color.hex;
  insert(`§${color.code}`);
}

/** 1.16+ truecolor: §x followed by six §H digit pairs. */
function insertCustomHex() {
  const digits = customHex.value.replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(digits)) return;
  lastColor.value = customHex.value;
  insert("§x" + [...digits].map((d) => `§${d}`).join(""));
}
</script>
