import { relative } from "node:path";
import type { ProjectFinding } from "../rules/types.js";
import { toPosix } from "../core/files.js";
import { localBin, runTool } from "./run.js";

interface EslintMessage {
  ruleId: string | null;
  message: string;
  line?: number;
}

interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
}

export function runEslint(root: string, files: string[]): ProjectFinding[] {
  if (files.length === 0) return [];
  const { stdout, status } = runTool("eslint", localBin(root, "eslint"), ["--format", "json", ...files], root);
  let results: EslintResult[];
  try {
    results = JSON.parse(stdout) as EslintResult[];
  } catch {
    throw new Error(`eslint produced no JSON (exit ${status}). Run \`npx eslint ${files[0]}\` to see why.`);
  }
  return results.flatMap((r) =>
    r.messages.map((m) => ({
      file: toPosix(relative(root, r.filePath)),
      line: m.line ?? 1,
      message: `${m.ruleId ?? "eslint"}: ${m.message}`,
      fix: "Fix it the way the rule describes; do not add an eslint-disable.",
    })),
  );
}
