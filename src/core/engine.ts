import { loadIndex } from "../codemap/build.js";
import { FILE_RULES, PATH_RULES, PROJECT_RULES, RULE_IDS, type RuleDoc } from "../rules/registry.js";
import type { RuleContext } from "../rules/types.js";
import { loadConfig, type Config, type Level } from "./config.js";
import { loadDirection } from "./direction.js";
import type { SourceFile } from "./files.js";
import type { Finding } from "./findings.js";
import { matchesAny } from "./glob.js";
import { isChanged, type ChangedLines } from "./git.js";

export function loadContext(root: string): RuleContext {
  const config = loadConfig(root);
  for (const key of [...Object.keys(config.rules), ...config.ignores.map((i) => i.rule)]) {
    if (!RULE_IDS.has(key)) throw new Error(`Unknown rule "${key}" in .deslopify/config.json. Known rules: ${[...RULE_IDS].join(", ")}.`);
  }
  return { config, index: loadIndex(root), direction: loadDirection(root) };
}

export const levelOf = (rule: RuleDoc, config: Config): Level => config.rules[rule.id] ?? rule.defaultLevel;

const isIgnored = (config: Config, rule: string, path: string): boolean =>
  config.ignores.some((i) => i.rule === rule && matchesAny(path, i.files));

/** Findings for one file. Only lines in `baseline` count, so old problems stay quiet. */
export function checkFile(ctx: RuleContext, file: SourceFile, baseline: ChangedLines): Finding[] {
  const out: Finding[] = [];
  const isTest = matchesAny(file.path, ctx.config.testPaths);
  for (const rule of FILE_RULES) {
    const level = levelOf(rule, ctx.config);
    if (level === "off") continue;
    if (!rule.langs.includes(file.lang) || (rule.skipTests && isTest) || isIgnored(ctx.config, rule.id, file.path)) continue;
    for (const f of rule.check(file, ctx)) {
      if (isChanged(baseline, f.line)) out.push({ ...f, rule: rule.id, level, file: file.path, why: rule.why });
    }
  }
  return out;
}

/** Findings for rules that look across files, limited to `files` (the ones being reported on). */
export function checkProject(ctx: RuleContext, all: readonly SourceFile[], report: ReadonlyMap<string, ChangedLines>): Finding[] {
  const out: Finding[] = [];
  for (const rule of PROJECT_RULES) {
    const level = levelOf(rule, ctx.config);
    if (level === "off") continue;
    for (const f of rule.checkProject(all, ctx)) {
      const baseline = report.get(f.file);
      if (baseline && isChanged(baseline, f.line) && !isIgnored(ctx.config, rule.id, f.file)) out.push({ ...f, rule: rule.id, level, why: rule.why });
    }
  }
  return out;
}

/** Findings about where a path is. Used before a write. */
export function checkPath(config: Config, path: string): Finding[] {
  return PATH_RULES.flatMap((rule) => {
    const level = levelOf(rule, config);
    if (level === "off" || isIgnored(config, rule.id, path)) return [];
    const hit = rule.checkPath(path, config);
    return hit ? [{ ...hit, rule: rule.id, level, file: path, line: 1, why: rule.why }] : [];
  });
}

