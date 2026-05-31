import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * The Minecraft "obfuscated" style (`§k`), which scrambles glyphs at runtime.
 * There's no standard TipTap mark for it, so we add a tiny one that renders a
 * tagged span. Live scrambling would fight with editing, so in the editor it's
 * shown as a distinct style — the actual animation happens in the preview.
 */
export const Obfuscated = Mark.create({
  name: "obfuscated",

  parseHTML() {
    return [{ tag: "span[data-obfuscated]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-obfuscated": "",
        class: "motd-obfuscated",
      }),
      0,
    ];
  },
});
