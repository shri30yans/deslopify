import { matchesAny } from "../core/glob.js";
import { MARKUP_LANGS, UI_LANGS, lineMatches, type RawFinding, type Rule } from "./types.js";

const HEX = /(^|[\s"'`[(:,=])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/;
const COLOR_FN = /\b(rgba?|hsla?|oklch|oklab)\(\s*\d/;

export const tokenColor: Rule = {
  id: "DS-TOKEN",
  phase: "write",
  instruction: "Style with the design tokens only: no raw hex/rgb colours outside the token file.",
  why: "One-off colours drift from the palette; tokens keep every screen in the same world.",
  langs: UI_LANGS,
  defaultLevel: "warn",
  check(file, { config }) {
    if (matchesAny(file.path, config.tokenFiles)) return [];
    const out: RawFinding[] = [];
    file.lines.forEach((text, i) => {
      if (/\b(href|id|to)=|url\(#|<meta\b|^\s*(\/\/|\*|<!--)/.test(text)) return;
      if (file.lang === "css" && /^\s*--[\w-]+\s*:/.test(text)) return;
      const hex = HEX.exec(text);
      const fn = COLOR_FN.exec(text);
      const raw = hex ? `#${hex[2]}` : fn?.[0];
      if (raw) out.push({ line: i + 1, message: `Raw colour \`${raw}\` outside the token file.`, fix: "Use a token (CSS variable or theme colour), or add one to the token file if it is genuinely new." });
    });
    return out;
  },
};

/** Numeric lengths in brackets (p-[13px], text-[13px]) step around the scale. calc(), var(), colours and shadows are out of scope: tokens and DS-TOKEN cover those. */
const ARBITRARY = /(?<![\w-])((?:[a-z0-9-]+:)*-?[a-z][a-z0-9-]*-\[-?\d*\.?\d+(?:px|rem|em|vh|vw|svh|dvh|%)\])/;

export const arbitraryValue: Rule = {
  id: "DS-ARBITRARY",
  phase: "write",
  instruction: "Use the spacing, size and colour scale; no arbitrary Tailwind values like p-[13px].",
  why: "Arbitrary values break the rhythm of the spacing and type scale one element at a time.",
  langs: MARKUP_LANGS,
  defaultLevel: "warn",
  check(file, { config }) {
    const allowed = config.allowArbitrary.map((p) => new RegExp(p));
    return lineMatches(file, ARBITRARY, (m, line) => {
      const cls = m[1].replace(/^(?:[a-z0-9-]+:)+/, "");
      if (allowed.some((re) => re.test(cls))) return null;
      return { line, message: `Arbitrary value \`${m[1]}\`.`, fix: "Use the nearest scale step, or add a named token to the theme." };
    });
  },
};

export const gradientText: Rule = {
  id: "DS-GRADIENT-TEXT",
  phase: "write",
  instruction: "Create emphasis with size, weight or colour, not gradient-filled text.",
  why: "Gradient text is the most recognisable AI-template tell and often fails contrast.",
  langs: UI_LANGS,
  defaultLevel: "warn",
  check(file) {
    return lineMatches(file, /bg-clip-text|background-clip:\s*text|-webkit-text-fill-color:\s*transparent/, (_m, line) => ({
      line,
      message: "Gradient-filled text.",
      fix: "Use a solid token colour; emphasise with weight or size.",
    }));
  },
};

export const aiGradient: Rule = {
  id: "DS-AI-GRADIENT",
  phase: "write",
  instruction: "Take gradients from the direction's palette; avoid the default purple→blue/pink sweep.",
  why: "Purple-to-blue gradients are the statistical default of AI-made sites.",
  langs: UI_LANGS,
  defaultLevel: "warn",
  check(file) {
    return lineMatches(file, /from-(purple|violet|indigo|fuchsia)-\d{2,3}\b[^"'`]*\b(via|to)-(blue|cyan|pink|purple|violet|indigo|fuchsia)-\d{2,3}/, (_m, line) => ({
      line,
      message: "Default purple/blue gradient.",
      fix: "Use the accent and surface tokens from direction.json, or a flat colour.",
    }));
  },
};

export const glow: Rule = {
  id: "DS-GLOW",
  phase: "write",
  instruction: "Give shadows an offset and soft blur in the palette's ink colour; no zero-offset coloured glows.",
  why: "A zero-offset coloured halo is decoration, not depth, and reads as template polish.",
  langs: UI_LANGS,
  defaultLevel: "warn",
  check(file) {
    return lineMatches(file, /(?:drop-)?shadow-\[0_0_[1-9]\d*px|box-shadow:\s*0(?:px)?\s+0(?:px)?\s+[1-9]\d*px\s+(?:\d+px\s+)?(?:#|rgba?\((?!0,\s*0,\s*0)|hsl|var\(--(?:accent|primary|brand))/, (_m, line) => ({
      line,
      message: "Zero-offset coloured glow.",
      fix: "Use an offset shadow from the token scale (e.g. 0 8px 24px with a tinted ink colour).",
    }));
  },
};

export const emojiIcon: Rule = {
  id: "DS-EMOJI-ICON",
  phase: "write",
  instruction: "Use the project's icon library (one stroke, one weight) instead of emoji as icons.",
  why: "Emoji render differently on every platform and read as placeholder design.",
  langs: MARKUP_LANGS,
  defaultLevel: "warn",
  skipTests: true,
  check(file) {
    return lineMatches(file, /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u, (m, line) => ({
      line,
      message: `Emoji \`${m[0]}\` used in the interface.`,
      fix: "Use an icon from the installed library (e.g. lucide-react).",
    }));
  },
};

export const placeholder: Rule = {
  id: "DS-PLACEHOLDER",
  phase: "write",
  instruction: "Use real copy and art-directed assets; mark anything missing as TBD for the user.",
  why: "Lorem ipsum and stock placeholders get shipped and make the page look unfinished.",
  langs: [...UI_LANGS, "ts", "js", "md"],
  defaultLevel: "warn",
  skipTests: true,
  check(file) {
    return lineMatches(file, /lorem ipsum|dolor sit amet|via\.placeholder\.com|placehold\.co|placekitten|picsum\.photos|source\.unsplash\.com|John Doe|Jane Doe|acme (inc|corp)/i, (m, line) => ({
      line,
      message: `Placeholder content \`${m[0]}\`.`,
      fix: "Replace with real content, or a clearly marked TBD the user must fill.",
    }));
  },
};

export const imgAlt: Rule = {
  id: "DS-ALT",
  phase: "write",
  instruction: "Give every image an alt: describe meaningful images, use alt=\"\" for decoration.",
  why: "Missing alt text fails screen readers and SEO.",
  langs: MARKUP_LANGS,
  defaultLevel: "warn",
  check(file) {
    return lineMatches(file, /<img\b(?![^>]*\balt=)[^>]*>/, (_m, line) => ({ line, message: "<img> without alt.", fix: 'Add alt="…" (or alt="" if purely decorative).' }));
  },
};
