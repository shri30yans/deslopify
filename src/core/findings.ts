export type Severity = "block" | "warn";

export interface Finding {
  rule: string;
  level: Severity;
  file: string;
  line: number;
  message: string;
  fix: string;
  why: string;
  /** Stable identity for findings that have no line to anchor to (render problems); used by the baseline. */
  key?: string;
}

export function formatFinding(f: Finding): string {
  return `[${f.rule}] ${f.file}:${f.line} ${f.message}\n  Fix: ${f.fix}\n  Why: ${f.why}`;
}

/** Blocking findings first, then by file and line; capped so the agent gets the most important few. */
export function formatReport(findings: readonly Finding[], max = 8): string {
  const sorted = [...findings].sort(
    (a, b) => Number(b.level === "block") - Number(a.level === "block") || a.file.localeCompare(b.file) || a.line - b.line,
  );
  const shown = sorted.slice(0, max).map(formatFinding);
  const hidden = sorted.length - shown.length;
  if (hidden > 0) shown.push(`…and ${hidden} more (run \`deslopify score\` for the full list).`);
  return shown.join("\n");
}
