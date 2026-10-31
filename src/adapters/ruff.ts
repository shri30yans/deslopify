import { relative } from "node:path";
import type { ProjectFinding } from "../rules/types.js";
import { toPosix } from "../core/files.js";
import { runTool } from "./run.js";

interface RuffDiagnostic {
  code: string | null;
  message: string;
  filename: string;
  location: { row: number };
  fix?: { message?: string } | null;
}

export function runRuff(root: string, files: string[]): ProjectFinding[] {
  if (files.length === 0) return [];
  const { stdout, status } = runTool("ruff", "ruff", ["check", "--output-format", "json", "--no-fix", ...files], root);
  let diagnostics: RuffDiagnostic[];
  try {
    diagnostics = JSON.parse(stdout) as RuffDiagnostic[];
  } catch {
    throw new Error(`ruff produced no JSON (exit ${status}). Run \`ruff check ${files[0]}\` to see why.`);
  }
  return diagnostics.map((d) => ({
    file: toPosix(relative(root, d.filename)),
    line: d.location.row,
    message: `${d.code ?? "ruff"}: ${d.message}`,
    fix: d.fix?.message ?? "Fix it the way the rule describes; do not add a noqa.",
  }));
}
