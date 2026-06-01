<template>
  <div class="space-y-2">
    <!-- Header toolbar -->
    <div
      class="flex flex-wrap items-center gap-1 rounded-t-md border border-default bg-elevated/50 p-1"
    >
      <UButton
        v-for="format in formats"
        :key="format.code"
        :icon="format.icon"
        :color="isActive(format.mark) ? 'primary' : 'neutral'"
        :variant="isActive(format.mark) ? 'soft' : 'ghost'"
        size="xs"
        square
        :aria-label="format.name"
        @click="toggle(format.mark)"
      />

      <USeparator orientation="vertical" class="mx-0.5 h-5" />

      <!-- Color picker -->
      <UPopover>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          square
          aria-label="Text color"
        >
          <span
            class="size-4 rounded-sm ring-1 ring-inset ring-white/15"
            :style="{ backgroundColor: activeColor || '#FFFFFF' }"
          />
        </UButton>

        <template #content>
          <div class="w-56 p-2">
            <div class="grid grid-cols-8 gap-1">
              <button
                v-for="color in colors"
                :key="color.code"
                type="button"
                class="size-5 rounded-sm ring-1 ring-inset ring-white/10 transition hover:scale-110"
                :class="{ 'ring-2 ring-primary': activeColor?.toLowerCase() === color.hex.toLowerCase() }"
                :style="{ backgroundColor: color.hex }"
                :title="`${color.name} (§${color.code})`"
                @click="setColor(color.hex)"
              />
            </div>

            <USeparator class="my-2" />

            <div class="flex items-center gap-2">
              <input
                type="color"
                :value="activeColor || '#ffffff'"
                aria-label="Custom hex color"
                class="size-7 shrink-0 cursor-pointer rounded border border-default bg-transparent p-0"
                @input="setColor(($event.target as HTMLInputElement).value)"
              />
              <UInput
                :model-value="activeColor ?? ''"
                size="xs"
                placeholder="#rrggbb"
                class="flex-1 font-mono"
                @update:model-value="onHexInput"
              />
            </div>
            <p class="mt-1 text-[11px] text-dimmed">Custom color (1.16+)</p>
          </div>
        </template>
      </UPopover>

      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-heroicons-arrow-uturn-left"
        aria-label="Clear formatting"
        square
        @click="clearAll"
      />

      <USeparator orientation="vertical" class="mx-0.5 h-5" />

      <UButton
        v-if="lineCount < 2"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-heroicons-bars-2"
        label="Add line 2"
        @click="addSecondLine"
      />
      <UButton
        v-else
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-heroicons-minus"
        label="Remove line 2"
        @click="removeSecondLine"
      />

      <div class="ms-auto">
        <MotdLegend />
      </div>
    </div>

    <!-- Inline bubble menu (shown on selection). Positioned absolutely from
         the start so it never participates in layout — the BubbleMenu plugin
         only takes over (and moves it into the editor wrapper) the first time
         a selection shows it; until then it must not push the editor down. -->
    <div
      ref="bubble"
      class="absolute z-50 flex items-center gap-0.5 rounded-md border border-default bg-default p-1 shadow-lg"
      style="visibility: hidden"
    >
      <UButton
        v-for="format in formats"
        :key="format.code"
        :icon="format.icon"
        :color="isActive(format.mark) ? 'primary' : 'neutral'"
        :variant="isActive(format.mark) ? 'soft' : 'ghost'"
        size="xs"
        square
        :aria-label="format.name"
        @click="toggle(format.mark)"
      />
      <USeparator orientation="vertical" class="mx-0.5 h-5" />
      <button
        v-for="color in colors"
        :key="color.code"
        type="button"
        class="size-4 rounded-sm ring-1 ring-inset ring-white/10 transition hover:scale-110"
        :style="{ backgroundColor: color.hex }"
        :title="`${color.name} (§${color.code})`"
        @click="setColor(color.hex)"
      />
      <input
        type="color"
        :value="activeColor || '#ffffff'"
        aria-label="Custom hex color"
        title="Custom color (1.16+)"
        class="size-4 shrink-0 cursor-pointer rounded-sm bg-transparent p-0"
        @input="setColor(($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Editable surface -->
    <div class="relative -mt-2">
      <EditorContent
        :editor="editor"
        class="rounded-b-md border border-t-0 border-default"
      />
      <span
        v-if="isEmpty"
        class="pointer-events-none absolute left-3 top-2 text-sm text-dimmed"
      >
        Welcome to the server!
      </span>
    </div>

    <!-- Live preview -->
    <div class="rounded-md bg-black/60 px-3 py-2 ring-1 ring-inset ring-white/5">
      <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-dimmed">
        Preview
      </p>
      <MotdPreview v-if="model" :motd="model" />
      <p v-else class="text-sm text-dimmed italic">Nothing to preview yet</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { StarterKit } from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { BubbleMenuPlugin } from "@tiptap/extension-bubble-menu";
import { Obfuscated } from "./Obfuscated";
import MotdLegend from "./MotdLegend.vue";
import MotdPreview from "./MotdPreview.vue";
import {
  MOTD_COLORS,
  MOTD_FORMATS,
  motdToJson,
  jsonToMotd,
  normalizeHex,
  type TipTapDoc,
} from "~/utils/motd";

const model = defineModel<string>({ default: "" });

const colors = MOTD_COLORS;
const formats = MOTD_FORMATS;

const bubble = useTemplateRef<HTMLElement>("bubble");

const editor = useEditor({
  content: motdToJson(model.value),
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
    attributes: {
      class: "motd-surface focus:outline-none",
      spellcheck: "false",
    },
    // Minecraft only renders two MOTD lines, so cap the editor at two
    // paragraphs and keep line breaks to real paragraph splits (no hard breaks).
    handleKeyDown: (view, event) => {
      if (event.key !== "Enter") return false;
      if (event.shiftKey) return true;
      return view.state.doc.childCount >= 2;
    },
  },
  onUpdate: ({ editor }) => {
    const next = jsonToMotd(editor.getJSON() as TipTapDoc);
    if (next !== model.value) model.value = next;
  },
});

// Keep the editor in sync when the model is replaced externally (e.g. the edit
// modal loading an existing server's MOTD).
watch(model, (value) => {
  const ed = editor.value;
  if (!ed) return;
  const current = jsonToMotd(ed.getJSON() as TipTapDoc);
  if (value !== current) ed.commands.setContent(motdToJson(value));
});

// Wire up the floating bubble menu once both the editor and its element exist.
let bubbleRegistered = false;
watchEffect(() => {
  const ed = editor.value;
  if (!ed || !bubble.value || bubbleRegistered) return;
  bubbleRegistered = true;
  ed.registerPlugin(
    BubbleMenuPlugin({
      pluginKey: "motdBubbleMenu",
      editor: ed,
      element: bubble.value,
      updateDelay: 0,
      shouldShow: ({ state, from, to }) =>
        from !== to && !state.selection.empty,
    })
  );
});

const isEmpty = computed(() => editor.value?.isEmpty ?? model.value === "");
const lineCount = computed(() => editor.value?.state.doc.childCount ?? 1);
const isActive = (mark: string) => editor.value?.isActive(mark) ?? false;

// Split the single line into two, or collapse back to one. Minecraft shows at
// most two MOTD lines, so this toggles between them.
const addSecondLine = () =>
  editor.value?.chain().focus("end").splitBlock().run();
const removeSecondLine = () => {
  model.value = (model.value ?? "").split("\n")[0] ?? "";
  nextTick(() => editor.value?.commands.focus("end"));
};
const activeColor = computed(
  () => editor.value?.getAttributes("textStyle").color as string | undefined
);

const toggle = (mark: string) =>
  editor.value?.chain().focus().toggleMark(mark).run();
const setColor = (hex: string) =>
  editor.value?.chain().focus().setColor(hex).run();
const onHexInput = (value: string) => {
  const hex = normalizeHex(value);
  if (hex) setColor(hex);
};
const clearAll = () =>
  editor.value?.chain().focus().unsetColor().unsetAllMarks().run();
</script>

<style scoped>
:deep(.motd-surface) {
  min-height: 2.5rem;
  padding: 0.5rem 0.75rem;
  font-family: "Monocraft", monospace;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #f4f4f5;
  background-color: rgba(0, 0, 0, 0.35);
  border-bottom-left-radius: calc(var(--ui-radius) * 1.5);
  border-bottom-right-radius: calc(var(--ui-radius) * 1.5);
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

/* The obfuscated style scrambles at runtime in-game; in the editor we just
   flag it so the text stays readable while writing. */
:deep(.motd-obfuscated) {
  border-radius: 2px;
  padding: 0 1px;
  background-image: repeating-linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.12),
    rgba(255, 255, 255, 0.12) 2px,
    transparent 2px,
    transparent 4px
  );
}
</style>
