import { extractFile } from "../codemap/build.js";
import { findSimilar } from "../codemap/similarity.js";
import { matchesAny } from "../core/glob.js";
import type { Rule } from "./types.js";

export const reuse: Rule = {
  id: "DS-REUSE",
  phase: "before",
  instruction: "Before creating a function, component or type, check the codemap's reuse table; use the existing one or extend it.",
  why: "One implementation per behaviour: duplicates drift apart and double every future fix.",
  langs: ["ts", "tsx", "js", "jsx", "py"],
  defaultLevel: "block",
  skipTests: true,
  check(file, ctx) {
    const known = new Set([...ctx.index.files.map((f) => f.path), file.path]);
    const previous = new Set(ctx.index.files.find((f) => f.path === file.path)?.exports.map((s) => s.name));
    const others = ctx.index.symbols.filter((s) => s.file !== file.path && !matchesAny(s.file, ctx.config.testPaths));
    return extractFile(file, known, ctx.config)
      .exports.filter((s) => !previous.has(s.name))
      .flatMap((candidate) => {
        const best = findSimilar(candidate, others, 0.75)[0];
        if (!best) return [];
        const { existing } = best;
        return [{
          line: candidate.line,
          message: `\`${candidate.name}\` looks like a second \`${existing.name}\` (${existing.file}:${existing.line}, ${Math.round(best.similarity * 100)}% name match).`,
          fix: `Use \`${existing.name}\`${existing.canonical ? " (marked ★)" : ""}, or add an option to it. If they truly differ, rename this one for what it does differently.`,
        }];
      });
  },
};
