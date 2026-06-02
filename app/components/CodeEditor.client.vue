<template>
  <!-- Wrapper owns the size (and receives fallthrough classes); Monaco fills it
       absolutely. Monaco can't size itself — without a positively-sized
       container it collapses to a few pixels, so keep a min-height fallback. -->
  <div class="relative w-full min-h-48">
    <div ref="host" class="absolute inset-0" />
  </div>
</template>

<script setup lang="ts">
// modern-monaco: ESM-first Monaco that ships its own workers and lazy-loads
// Shiki grammars/themes. Imported dynamically so the heavy editor core only
// loads in the browser, when an editor is actually opened.
import type * as MonacoNS from "modern-monaco/editor-core";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    language?: string;
    /** Shiki theme ids for light/dark; picked from the active color mode. */
    theme?: string;
  }>(),
  { language: "plaintext", theme: "vitesse-dark" }
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const host = ref<HTMLElement | null>(null);

let monaco: typeof MonacoNS | null = null;
let editor: MonacoNS.editor.IStandaloneCodeEditor | null = null;
let model: MonacoNS.editor.ITextModel | null = null;
// Guards the change emit from echoing back into setValue.
let applyingExternal = false;

onMounted(async () => {
  const { init } = await import("modern-monaco");
  monaco = await init({
    defaultTheme: props.theme,
    themes: ["vitesse-dark", "vitesse-light"],
    langs: ["yaml", "json", "ini", "toml"],
  });

  if (!host.value) return;

  editor = monaco.editor.create(host.value, {
    theme: props.theme,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    tabSize: 2,
    renderWhitespace: "boundary",
  });

  model = monaco.editor.createModel(props.modelValue, props.language);
  editor.setModel(model);

  editor.onDidChangeModelContent(() => {
    if (applyingExternal) return;
    emit("update:modelValue", model!.getValue());
  });
});

watch(
  () => props.modelValue,
  (value) => {
    if (model && value !== model.getValue()) {
      applyingExternal = true;
      model.setValue(value);
      applyingExternal = false;
    }
  }
);

watch(
  () => props.language,
  (language) => {
    if (monaco && model) monaco.editor.setModelLanguage(model, language);
  }
);

watch(
  () => props.theme,
  (theme) => {
    if (monaco && theme) monaco.editor.setTheme(theme);
  }
);

onUnmounted(() => {
  editor?.dispose();
  model?.dispose();
});
</script>
