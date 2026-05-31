/**
 * Minecraft MOTD formatting codec.
 *
 * Minecraft renders the "message of the day" using legacy formatting codes: a
 * section sign (`§`) followed by a single character that sets a colour or a
 * style (bold, italic, …). We let users edit the MOTD as rich text in TipTap
 * and translate to/from that wire format here so the rest of the app keeps
 * storing a plain `§`-coded string.
 *
 * Semantics that matter for (de)serialisation:
 *   - A colour code (0-9, a-f) resets all active styles, then sets the colour.
 *   - A style code (k, l, m, n, o) adds to whatever is already active.
 *   - `§r` resets everything back to the default (no colour, no styles).
 */

export interface MotdColor {
  /** Legacy code character, e.g. "c". */
  code: string;
  name: string;
  /** Foreground colour used both for the editor and the preview. */
  hex: string;
}

/** The 16 vanilla colours, in code order. */
export const MOTD_COLORS: MotdColor[] = [
  { code: "0", name: "Black", hex: "#000000" },
  { code: "1", name: "Dark Blue", hex: "#0000AA" },
  { code: "2", name: "Dark Green", hex: "#00AA00" },
  { code: "3", name: "Dark Aqua", hex: "#00AAAA" },
  { code: "4", name: "Dark Red", hex: "#AA0000" },
  { code: "5", name: "Dark Purple", hex: "#AA00AA" },
  { code: "6", name: "Gold", hex: "#FFAA00" },
  { code: "7", name: "Gray", hex: "#AAAAAA" },
  { code: "8", name: "Dark Gray", hex: "#555555" },
  { code: "9", name: "Blue", hex: "#5555FF" },
  { code: "a", name: "Green", hex: "#55FF55" },
  { code: "b", name: "Aqua", hex: "#55FFFF" },
  { code: "c", name: "Red", hex: "#FF5555" },
  { code: "d", name: "Light Purple", hex: "#FF55FF" },
  { code: "e", name: "Yellow", hex: "#FFFF55" },
  { code: "f", name: "White", hex: "#FFFFFF" },
];

export interface MotdFormat {
  /** Legacy code character, e.g. "l". */
  code: string;
  name: string;
  /** Matching TipTap mark name. */
  mark: string;
  /** Heroicons name for toolbar/legend buttons. */
  icon: string;
}

/** The style codes we expose. `§r` (reset) is handled separately. */
export const MOTD_FORMATS: MotdFormat[] = [
  { code: "l", name: "Bold", mark: "bold", icon: "i-heroicons-bold" },
  { code: "o", name: "Italic", mark: "italic", icon: "i-heroicons-italic" },
  { code: "n", name: "Underline", mark: "underline", icon: "i-heroicons-underline" },
  { code: "m", name: "Strikethrough", mark: "strike", icon: "i-heroicons-strikethrough" },
  { code: "k", name: "Obfuscated", mark: "obfuscated", icon: "i-heroicons-sparkles" },
];

const colorByCode = new Map(MOTD_COLORS.map((c) => [c.code, c]));
const colorByHex = new Map(MOTD_COLORS.map((c) => [c.hex.toLowerCase(), c]));
const formatByCode = new Map(MOTD_FORMATS.map((f) => [f.code, f]));
const formatByMark = new Map(MOTD_FORMATS.map((f) => [f.mark, f]));

/** Look up the legacy code for a TipTap colour value (hex), if it's a vanilla colour. */
export const motdCodeForHex = (hex: string): string | undefined =>
  colorByHex.get(hex.toLowerCase())?.code;

// --- Minimal TipTap document shapes (we only touch text/hardBreak nodes). ---

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}
interface TipTapNode {
  type: string;
  text?: string;
  marks?: TipTapMark[];
  content?: TipTapNode[];
}
export interface TipTapDoc {
  type: "doc";
  content: TipTapNode[];
}

/** Active formatting state while walking the document. */
interface MotdState {
  color: string;
  formats: Set<string>;
}

/**
 * Parse a `§`-coded string into a TipTap document. Accepts both `§` and the
 * common `&` shorthand on input. Each line becomes its own paragraph (the
 * editor caps this at the two lines Minecraft actually shows), and formatting
 * carries across the line break just like it does in-game.
 */
export function motdToJson(motd: string): TipTapDoc {
  let paragraph: TipTapNode = { type: "paragraph", content: [] };
  const doc: TipTapDoc = { type: "doc", content: [paragraph] };

  let color = "";
  const formats = new Set<string>();
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    paragraph.content!.push(textNode(buffer, color, formats));
    buffer = "";
  };

  const chars = [...(motd ?? "")];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if ((ch === "§" || ch === "&") && i + 1 < chars.length) {
      const code = chars[i + 1]!.toLowerCase();
      if (code === "r" || colorByCode.has(code) || formatByCode.has(code)) {
        flush();
        i++;
        if (code === "r") {
          color = "";
          formats.clear();
        } else if (colorByCode.has(code)) {
          // A colour resets active styles in Minecraft.
          color = code;
          formats.clear();
        } else {
          formats.add(code);
        }
        continue;
      }
    }

    if (ch === "\n") {
      // Start a new line. Active colour/styles carry over, matching Minecraft.
      flush();
      paragraph = { type: "paragraph", content: [] };
      doc.content.push(paragraph);
      continue;
    }

    buffer += ch;
  }
  flush();

  return doc;
}

function textNode(text: string, color: string, formats: Set<string>): TipTapNode {
  const marks: TipTapMark[] = [];
  const c = colorByCode.get(color);
  if (c) marks.push({ type: "textStyle", attrs: { color: c.hex } });
  for (const f of formats) {
    const fmt = formatByCode.get(f);
    if (fmt) marks.push({ type: fmt.mark });
  }
  return marks.length ? { type: "text", text, marks } : { type: "text", text };
}

/**
 * Serialise a TipTap document back into a `§`-coded string, emitting the
 * minimal codes needed to move between runs (reset only when a style has to be
 * cleared, since Minecraft can't drop a single style without `§r`).
 */
export function jsonToMotd(doc: TipTapDoc | null | undefined): string {
  const state: MotdState = { color: "", formats: new Set() };
  let out = "";

  const blocks = doc?.content ?? [];
  blocks.forEach((block, i) => {
    if (i > 0) out += "\n";
    out += serializeInline(block.content ?? [], state);
  });

  return out;
}

function serializeInline(nodes: TipTapNode[], state: MotdState): string {
  let out = "";

  for (const node of nodes) {
    if (node.type === "hardBreak") {
      out += "\n";
      continue;
    }
    if (node.type !== "text" || !node.text) continue;

    const { color, formats } = readMarks(node.marks);

    // Reset when the colour changes away from a set value, or when any active
    // style is no longer wanted — Minecraft has no per-style "off".
    const needsReset =
      (state.color !== "" && state.color !== color) ||
      [...state.formats].some((f) => !formats.has(f));

    if (needsReset) {
      out += "§r";
      state.color = "";
      state.formats.clear();
    }

    if (color && color !== state.color) {
      out += "§" + color;
      state.color = color;
      state.formats.clear(); // applying a colour clears styles in Minecraft
    }

    for (const f of formats) {
      if (!state.formats.has(f)) {
        out += "§" + f;
        state.formats.add(f);
      }
    }

    out += node.text;
  }

  return out;
}

function readMarks(marks: TipTapMark[] | undefined): { color: string; formats: Set<string> } {
  let color = "";
  const formats = new Set<string>();

  for (const m of marks ?? []) {
    if (m.type === "textStyle") {
      const hex = m.attrs?.color;
      if (typeof hex === "string") {
        const code = motdCodeForHex(hex);
        if (code) color = code;
      }
      continue;
    }
    const f = formatByMark.get(m.type);
    if (f) formats.add(f.code);
  }

  return { color, formats };
}
