import type { Config } from "../core/config.js";
import type { SourceFile } from "../core/files.js";
import { matchesAny } from "../core/glob.js";
import { extractFile } from "../codemap/build.js";
import { CODE_LANGS, SCRIPT_LANGS, type RawFinding, type Rule, type RuleContext } from "./types.js";

function importsOf(file: SourceFile, ctx: RuleContext) {
  const known = new Set(ctx.index.files.map((f) => f.path));
  return extractFile(file, known, ctx.config).imports;
}

const layerIndex = (config: Config, path: string): number => config.layers.findIndex((l) => matchesAny(path, l.paths));

export const layer: Rule = {
  id: "DS-LAYER",
  phase: "before",
  instruction: "Put code in the layer the codemap names; a file may only import from its own layer or layers below it.",
  why: "Imports that flow upward tangle the architecture so nothing can change in isolation.",
  langs: SCRIPT_LANGS,
  defaultLevel: "block",
  check(file, ctx) {
    const { config } = ctx;
    const own = layerIndex(config, file.path);
    if (own < 0) return [];
    return importsOf(file, ctx).flatMap((imp): RawFinding[] => {
      const target = imp.local ? layerIndex(config, imp.target) : -1;
      if (target < 0 || target >= own) return [];
      return [{
        line: imp.line,
        message: `\`${config.layers[own].name}\` file imports \`${imp.target}\` from the higher layer \`${config.layers[target].name}\`.`,
        fix: `Move the shared code down into \`${config.layers[own].name}\` or below, or pass it in from the caller.`,
      }];
    });
  },
};

const vendorMatch = (vendors: readonly string[], pkg: string): boolean =>
  vendors.some((v) => (v.endsWith("/*") ? pkg.startsWith(v.slice(0, -1)) : pkg === v));

export const adapter: Rule = {
  id: "DS-ADAPTER",
  phase: "write",
  instruction: "Import vendor SDKs (email, payments, AI, databases) only inside adapters/ or server code, behind one function.",
  why: "Wrapping a vendor once keeps the rest of the code independent of it (dependency inversion) and keeps keys server-side.",
  langs: CODE_LANGS,
  defaultLevel: "warn",
  check(file, ctx) {
    const { adapters } = ctx.config;
    if (matchesAny(file.path, adapters.paths)) return [];
    return importsOf(file, ctx)
      .filter((imp) => !imp.local && vendorMatch(adapters.vendors, imp.target))
      .map((imp) => ({
        line: imp.line,
        message: `Vendor SDK \`${imp.target}\` imported outside an adapter.`,
        fix: `Wrap it in one module under adapters/ (or api/) and import that wrapper here.`,
      }));
  },
};

export const mockProd: Rule = {
  id: "DS-MOCK-PROD",
  phase: "finish",
  instruction: "Keep fake and mock data in tests and fixtures, never on production paths.",
  why: "Mock data in production code ships fake content to real users.",
  langs: CODE_LANGS,
  defaultLevel: "warn",
  skipTests: true,
  check(file, ctx) {
    const fromImports = importsOf(file, ctx)
      .filter((imp) => /faker|casual|chance$|mockjs/.test(imp.target))
      .map((imp) => ({ line: imp.line, message: `Fake-data library \`${imp.target}\` imported in production code.`, fix: "Move it to tests or fixtures; use real data or an explicit empty state." }));
    const fromNames: RawFinding[] = [];
    file.lines.forEach((text, i) => {
      const m = /\b(?:const|let|var|def)\s+((?:mock|fake|dummy)[A-Z_]\w*)/.exec(text);
      if (m) fromNames.push({ line: i + 1, message: `Mock data \`${m[1]}\` defined in production code.`, fix: "Move it to a fixture, or replace it with real data and an empty state." });
    });
    return [...fromImports, ...fromNames];
  },
};
