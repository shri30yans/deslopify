import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadContext } from "../core/engine.js";
import { isSourcePath } from "../core/files.js";
import { formatReport, type Finding } from "../core/findings.js";
import { changedFiles } from "../core/git.js";
import { auditFiles, openTools } from "../core/pipeline.js";
import { formatScore, scoreFindings } from "../core/score.js";

export interface CheckResult {
  output: string;
  failed: boolean;
}

/** `deslopify check [files]`: files named, or else everything changed since HEAD. Fails on blocking findings. */
export function check(root: string, files: string[]): CheckResult {
  const ctx = loadContext(root);
  const paths = (files.length ? files : changedFiles(root)).filter((p) => isSourcePath(ctx.config, p) && existsSync(join(root, p)));
  if (paths.length === 0) return { output: "No changed source files to check.", failed: false };
  const findings = auditFiles(root, ctx, openTools(root, ctx), paths, files.length ? "all" : "git", { project: true });
  return { output: findings.length ? formatReport(findings, 40) : `Clean: ${paths.length} file${paths.length === 1 ? "" : "s"} checked.`, failed: findings.some((f) => f.level === "block") };
}

/** `deslopify score`: every file, every finding, one number. */
export function score(root: string): CheckResult {
  const ctx = loadContext(root);
  const findings: Finding[] = auditFiles(root, ctx, openTools(root, ctx), ctx.index.files.map((f) => f.path), "all", { project: true });
  const result = scoreFindings(findings, ctx.index);
  const worst = findings.length ? `\n\nTop findings:\n${formatReport(findings, 15)}` : "";
  return { output: `${formatScore(result)}${worst}`, failed: result.blocking > 0 };
}
