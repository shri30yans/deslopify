import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface FontFile {
  family: string;
  file: string;
  /** CSS font-weight: a number for static fonts, "min max" for variable ones. */
  weight: string;
  style: "normal" | "italic";
}

/** Fonts vendored in /fonts so boards render the same everywhere, offline. */
const FONT_FILES: readonly FontFile[] = [
  { family: "Manrope", file: "manrope-latin-wght-normal.woff2", weight: "200 800", style: "normal" },
  { family: "Inter", file: "inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  { family: "Geist", file: "geist-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  { family: "Outfit", file: "outfit-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  { family: "Space Grotesk", file: "space-grotesk-latin-wght-normal.woff2", weight: "300 700", style: "normal" },
  { family: "Fraunces", file: "fraunces-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  { family: "Fraunces", file: "fraunces-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  { family: "Instrument Serif", file: "instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
  { family: "Instrument Serif", file: "instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  { family: "IBM Plex Mono", file: "ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
  { family: "IBM Plex Mono", file: "ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
];

const fontsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fonts");

export const bundledFamilies = (): string[] => [...new Set(FONT_FILES.map((f) => f.family))];

/** @font-face rules for the given families, served from /fonts/<file>. A family we do not bundle is an error. */
export function fontFaceCss(families: readonly string[]): string {
  return [...new Set(families)]
    .flatMap((family) => {
      const files = FONT_FILES.filter((f) => f.family === family);
      if (files.length === 0) throw new Error(`Font "${family}" is not bundled. Bundled: ${bundledFamilies().join(", ")}.`);
      return files.map((f) => `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};font-display:block;src:url(/fonts/${f.file}) format("woff2");}`);
    })
    .join("\n");
}

/** Absolute path of a bundled font file by its served name, or null when no such file is bundled. */
export function fontFilePath(file: string): string | null {
  return FONT_FILES.some((f) => f.file === basename(file)) ? join(fontsDir, basename(file)) : null;
}
