import { runEslint } from "../adapters/eslint.js";
import { runRuff } from "../adapters/ruff.js";
import { extractFile, updateIndexFile } from "../codemap/build.js";
import type { CodemapIndex } from "../codemap/types.js";
import { openTsProject, type TsProject } from "../lsp/typescript.js";
import { lintClean, refs, typeCheck, type ToolRule } from "../rules/tools.js";
import type { ProjectFinding, RuleContext } from "../rules/types.js";
import { checkFile, checkProject, levelOf } from "./engine.js";
import { isScript, makeSourceFile, readSourceFile, type SourceFile } from "./files.js";
import type { Finding } from "./findings.js";
import { changedLines, isChanged, type ChangedLines } from "./git.js";
import { matchesAny } from "./glob.js";

export interface Tools {
  ts: TsProject | null;
}

/** Open the compilers the project enabled. Done once per process; opening a program is the slow part. */
export function openTools(root: string, ctx: RuleContext): Tools {
  return { ts: ctx.config.linters.includes("typescript") ? openTsProject(root) : null };
}

function toolFindings(ctx: RuleContext, rule: ToolRule, raw: readonly ProjectFinding[], baseline?: ReadonlyMap<string, ChangedLines>): Finding[] {
  const level = levelOf(rule, ctx.config);
  if (level === "off") return [];
  const ignored = ctx.config.ignores.filter((i) => i.rule === rule.id);
  return raw
    .filter((f) => (!baseline || isChanged(baseline.get(f.file) ?? "all", f.line)) && !ignored.some((i) => matchesAny(f.file, i.files)))
    .map((f) => ({ ...f, rule: rule.id, level, why: rule.why }));
}

export type Baseline = "git" | "all";

export interface AuditOptions {
  /** Include rules that compare files with each other (slower: reads the whole repo). */
  project: boolean;
}

/**
 * The one way to check files: our rules, then the project's compilers and linters.
 * `git` reports only lines changed since HEAD; `all` reports everything.
 */
export function auditFiles(root: string, ctx: RuleContext, tools: Tools, paths: readonly string[], baseline: Baseline, options: AuditOptions): Finding[] {
  const sources = paths.map((p) => readSourceFile(root, p));
  const lines = new Map<string, ChangedLines>(sources.map((f) => [f.path, baseline === "all" ? "all" : changedLines(root, f.path)]));
  const findings = sources.flatMap((f) => checkFile(ctx, f, lines.get(f.path) ?? "all"));

  if (options.project) {
    const everyFile = ctx.index.files.map((f) => readSourceFile(root, f.path));
    findings.push(...checkProject(ctx, everyFile, lines));
  }

  const ts = tools.ts;
  if (ts) findings.push(...toolFindings(ctx, typeCheck, sources.filter((f) => ts.has(f.path)).flatMap((f) => ts.diagnostics(f.path)), lines));
  if (ctx.config.linters.includes("eslint")) {
    findings.push(...toolFindings(ctx, lintClean, runEslint(root, sources.filter((f) => isScript(f.lang)).map((f) => f.path)), lines));
  }
  if (ctx.config.linters.includes("ruff")) {
    findings.push(...toolFindings(ctx, lintClean, runRuff(root, sources.filter((f) => f.lang === "py").map((f) => f.path)), lines));
  }
  return findings;
}

/** Exports whose name existed before the edit but whose signature changed. */
function changedSignatures(previous: CodemapIndex, next: SourceFile, ctx: RuleContext): string[] {
  const before = previous.files.find((f) => f.path === next.path);
  if (!before) return [];
  const after = extractFile(next, new Set([...previous.files.map((f) => f.path), next.path]), ctx.config);
  return after.exports.filter((s) => before.exports.some((b) => b.name === s.name && b.signature !== s.signature)).map((s) => s.name);
}

function signatureFindings(ctx: RuleContext, tools: Tools, file: SourceFile): Finding[] {
  if (!tools.ts?.has(file.path)) return [];
  const out: Finding[] = [];
  const callerFiles = new Set<string>();
  for (const name of changedSignatures(ctx.index, file, ctx)) {
    const callers = tools.ts.callers(file.path, name);
    if (callers.length === 0) continue;
    callers.forEach((c) => callerFiles.add(c));
    out.push(...toolFindings(ctx, refs, [{ file: file.path, line: 1, message: `Signature of \`${name}\` changed; ${callers.length} caller${callers.length === 1 ? "" : "s"}: ${callers.slice(0, 5).join(", ")}.`, fix: "Open each caller and update it to the new signature." }]));
  }
  for (const caller of [...callerFiles].slice(0, 10)) out.push(...toolFindings(ctx, typeCheck, tools.ts.diagnostics(caller)));
  return out;
}

export interface WrittenFileCheck {
  findings: Finding[];
  index: CodemapIndex;
}

/** After a write: audit the file against git, check callers of changed signatures, refresh the codemap entry. */
export function checkWrittenFile(root: string, ctx: RuleContext, tools: Tools, path: string): WrittenFileCheck {
  const file = readSourceFile(root, path);
  const findings = [...auditFiles(root, ctx, tools, [path], "git", { project: false }), ...signatureFindings(ctx, tools, file)];
  return { findings, index: updateIndexFile(ctx.config, ctx.index, file) };
}

/** Rules that can be judged from text alone, for a write that has not happened yet. */
export function checkProposed(ctx: RuleContext, path: string, text: string, changed: ChangedLines): Finding[] {
  return checkFile(ctx, makeSourceFile(path, text), changed);
}
