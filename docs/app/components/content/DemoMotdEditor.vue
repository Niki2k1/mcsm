<template>
  <div class="not-prose space-y-3 rounded-lg border border-default bg-default p-4">
    <!-- Toolbar — applies TipTap marks in the WYSIWYG tab, inserts §-codes in the code tab -->
    <div
      class="flex flex-wrap items-center gap-1 rounded-md border border-default bg-elevated/50 p-1"
    >
      <UButton
        v-for="format in MOTD_FORMATS"
        :key="format.code"
        :icon="formatIcons[format.code]"
        :color="isActive(format.mark) ? 'primary' : 'neutral'"
        :variant="isActive(format.mark) ? 'soft' : 'ghost'"
        size="xs"
        square
        :aria-label="`${format.name} (§${format.code})`"
        :title="`${format.name} (§${format.code})`"
        @click="applyFormat(format)"
      />

      <USeparator orientation="vertical" class="mx-0.5 h-5" />

      <!-- Color picker -->
      <UPopover>
        <UButton color="neutral" variant="ghost" size="xs" square aria-label="Text color">
          <span
            class="size-4 rounded-sm ring-1 ring-inset ring-white/15"
            :style="{ backgroundColor: activeColor }"
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
                :class="{ 'ring-2 ring-primary': activeColor?.toLowerCase() === color.hex.toLowerCase() }"
                :style="{ backgroundColor: color.hex }"
                :title="`${color.name} (§${color.code})`"
                @click="applyColor(color)"
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
              <UButton size="xs" color="neutral" variant="soft" @click="applyCustomHex">
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
        aria-label="Reset formatting"
        title="Reset formatting (§r)"
        square
        @click="applyReset"
      />

      <div class="flex-1" />

      <!-- Presets -->
      <UButton
        v-for="preset in presets"
        :key="preset.name"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="setMotd(preset.motd)"
      >
        {{ preset.name }}
      </UButton>
    </div>

    <!-- Tab switcher: WYSIWYG vs raw §-code source -->
    <UTabs
      v-model="tab"
      :items="tabItems"
      :content="false"
      color="neutral"
      size="xs"
    />

    <!-- WYSIWYG editor -->
    <div v-show="tab === 'editor'" class="relative">
      <ClientOnly>
        <EditorContent
          :editor="editor"
          class="rounded-md border border-default"
        />
        <span
          v-if="isEmpty"
          class="pointer-events-none absolute left-3 top-2 text-sm text-dimmed"
        >
          Type your MOTD…
        </span>
        <template #fallback>
          <div class="rounded-md border border-default px-3 py-2 font-mono text-sm text-dimmed">
            Loading editor…
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- Raw §-coded source -->
    <div v-show="tab === 'code'">
      <UTextarea
        ref="sourceInput"
        v-model="motd"
        :rows="2"
        autoresize
        class="w-full font-mono"
        placeholder="§aType your MOTD here — §6§lwith color codes!"
      />
    </div>

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
// Interactive recreation of MCSM's MOTD editor. Two synced representations of
// the same `§`-coded string: a TipTap WYSIWYG surface and a raw code view,
// switched with a tab. The in-game server list updates live from both.
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { StarterKit } from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Obfuscated } from "./Obfuscated";
import {
  MOTD_COLORS,
  MOTD_FORMATS,
  motdToJson,
  jsonToMotd,
  normalizeHex,
  type MotdColor,
  type MotdFormat,
  type TipTapDoc,
} from "~/utils/motd";

const motd = ref(
  "§b§lMy Awesome Server §r§7[§a1.21§7]\n§6✦ §eSkyblock §7| §d§kAA§r §5Mini-games §d§kAA"
);

const tab = ref<"editor" | "code">("editor");
const tabItems = [
  { label: "Editor", value: "editor", icon: "i-lucide-wand-sparkles" },
  { label: "Code", value: "code", icon: "i-lucide-code" },
];

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

// --- TipTap WYSIWYG editor ----------------------------------------------------

const editor = useEditor({
  content: motdToJson(motd.value),
  extensions: [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      code: false,
      horizontalRule: false,
      link: false,
    }),
    TextStyle,
    Color,
    Obfuscated,
  ],
  editorProps: {
    attributes: { class: "motd-surface focus:outline-none", spellcheck: "false" },
    // Minecraft renders at most two MOTD lines → cap the editor at two paragraphs.
    handleKeyDown: (view, event) => {
      if (event.key !== "Enter") return false;
      if (event.shiftKey) return true;
      return view.state.doc.childCount >= 2;
    },
  },
  onUpdate: ({ editor }) => {
    const next = jsonToMotd(editor.getJSON() as TipTapDoc);
    if (next !== motd.value) motd.value = next;
  },
});

// Keep the editor in sync when `motd` is replaced from the code view or a preset.
watch(motd, (value) => {
  const ed = editor.value;
  if (!ed) return;
  if (value !== jsonToMotd(ed.getJSON() as TipTapDoc)) {
    ed.commands.setContent(motdToJson(value));
  }
});

const isEmpty = computed(() => editor.value?.isEmpty ?? motd.value === "");
const activeColor = computed(
  () =>
    (editor.value?.getAttributes("textStyle").color as string | undefined) ??
    "#FFFFFF"
);
const isActive = (mark: string) =>
  tab.value === "editor" && (editor.value?.isActive(mark) ?? false);

// --- Toolbar actions (branch by active tab) -----------------------------------

const sourceInput = useTemplateRef<{ textareaRef?: HTMLTextAreaElement }>("sourceInput");
const customHex = ref("#ff7f50");

/** Insert a §-code at the cursor of the raw source textarea. */
function insert(code: string) {
  const textarea = sourceInput.value?.textareaRef;
  const pos = textarea?.selectionStart ?? motd.value.length;
  motd.value = motd.value.slice(0, pos) + code + motd.value.slice(pos);
  nextTick(() => {
    textarea?.focus();
    textarea?.setSelectionRange(pos + code.length, pos + code.length);
  });
}

function setMotd(value: string) {
  motd.value = value;
}

function applyFormat(format: MotdFormat) {
  if (tab.value === "editor") {
    editor.value?.chain().focus().toggleMark(format.mark).run();
  } else {
    insert(`§${format.code}`);
  }
}

function applyColor(color: MotdColor) {
  if (tab.value === "editor") {
    editor.value?.chain().focus().setColor(color.hex).run();
  } else {
    insert(`§${color.code}`);
  }
}

function applyCustomHex() {
  const hex = normalizeHex(customHex.value);
  if (!hex) return;
  if (tab.value === "editor") {
    editor.value?.chain().focus().setColor(hex).run();
  } else {
    const digits = hex.replace(/^#/, "");
    insert("§x" + [...digits].map((d) => `§${d}`).join(""));
  }
}

function applyReset() {
  if (tab.value === "editor") {
    editor.value?.chain().focus().unsetColor().unsetAllMarks().run();
  } else {
    insert("§r");
  }
}
</script>

<style scoped>
:deep(.motd-surface) {
  min-height: 3rem;
  padding: 0.5rem 0.75rem;
  font-family: "Monocraft", monospace;
  font-size: 0.95rem;
  line-height: 1.5;
}

:deep(.motd-surface p) {
  margin: 0;
  min-height: 1.4em;
}

/* Minecraft shows up to two MOTD lines; make the split between them explicit. */
:deep(.motd-surface p + p) {
  margin-top: 0.375rem;
  padding-top: 0.375rem;
  border-top: 1px dashed var(--ui-border-accented);
}

/* In-editor hint for obfuscated text (the real scramble animates in the preview). */
:deep(.motd-obfuscated) {
  border-radius: 2px;
  padding: 0 1px;
  background-image: repeating-linear-gradient(
    45deg,
    rgba(127, 127, 127, 0.25),
    rgba(127, 127, 127, 0.25) 2px,
    transparent 2px,
    transparent 4px
  );
}
</style>
