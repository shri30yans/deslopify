import ts from "typescript";
import { allowedFonts } from "../core/direction.js";
import { matchesAny } from "../core/glob.js";
import { lineOf, parseTs } from "../codemap/extractTs.js";
import { lineMatches, type RawFinding, type Rule } from "./types.js";

const STOCK = /\b(unlock (the|your) (full )?(power|potential)|harness the power|seamless(ly)?|elevate your|supercharge|in today'?s (fast-paced|digital)|revolutioni[sz](e|ing)|game[- ]chang(er|ing)|cutting[- ]edge|next[- ]level|best[- ]in[- ]class|world[- ]class|empower(s|ing)? (you|your)|streamline your|effortless(ly)?|take (it|your \w+) to the next level|get started today|look no further|one[- ]stop (shop|solution)|robust (and|solution)|leverag(e|ing) (the|our)|dive (in|into)|whether you'?re a)\b/i;

export const stockCopy: Rule = {
  id: "DS-STOCK-COPY",
  phase: "write",
  instruction: "Write copy in the product's own concrete words: say what it does, for whom, with a specific detail.",
  why: "Stock marketing phrases are the clearest tell that a page was generated, and they say nothing.",
  langs: ["tsx", "jsx", "html", "ts", "js", "md"],
  defaultLevel: "warn",
  skipTests: true,
  check(file) {
    return lineMatches(file, STOCK, (m, line) => ({
      line,
      message: `Stock phrase "${m[0]}".`,
      fix: "Replace it with a concrete claim the product can back up (what, who, how fast, how much).",
    }));
  },
};

export const contentInLayout: Rule = {
  id: "DS-CONTENT",
  phase: "write",
  instruction: "Keep user-facing copy, prices and claims in the content/data files; components only render them.",
  why: "Content mixed into layout gets duplicated, goes stale and can't be reviewed in one place.",
  langs: ["tsx", "jsx"],
  defaultLevel: "warn",
  skipTests: true,
  check(file, { config }) {
    if (matchesAny(file.path, config.contentPaths)) return [];
    const sf = parseTs(file);
    const out: RawFinding[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isJsxText(n)) {
        const text = n.getText(sf).replace(/\s+/g, " ").trim();
        if (text.split(" ").length >= 12) {
          out.push({ line: lineOf(sf, n), message: `Long copy hard-coded in a component: "${text.slice(0, 50)}…".`, fix: "Move it into the content/data file and render it from there." });
        }
      }
      n.forEachChild(visit);
    };
    visit(sf);
    return out;
  },
};

export const fonts: Rule = {
  id: "DS-FONT",
  phase: "write",
  instruction: "Use only the fonts named in direction.json (display and text).",
  why: "Every extra or default font dilutes the type system the direction chose.",
  langs: ["css", "html", "tsx", "jsx", "ts", "js"],
  defaultLevel: "warn",
  check(file, { direction }) {
    if (!direction) return [];
    const fontList = allowedFonts(direction);
    const allowed = new Set(fontList.map((f) => f.toLowerCase()));
    const generic = /^(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|inherit|initial|var\(.*)$/i;
    return lineMatches(file, /font-family:\s*([^;}"]+)|fonts\.googleapis\.com\/css2?\?family=([^&:"']+)|font-\['([^']+)'/, (m, line) => {
      const declared = (m[1] ?? m[2] ?? m[3]).split(",").map((f) => f.trim().replace(/^["']|["']$/g, "").replace(/\+/g, " "));
      const stray = declared.find((f) => f && !generic.test(f) && !allowed.has(f.toLowerCase()) && !/apple|segoe|blinkmac|helvetica|arial/i.test(f));
      return stray ? { line, message: `Font "${stray}" is not in the direction.`, fix: `Use one of: ${fontList.join(", ")}.` } : null;
    });
  },
};
