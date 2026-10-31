import type { CodemapIndex } from "../codemap/types.js";
import type { Finding } from "./findings.js";

export interface Score {
  /** 0–100. 100 means no findings; 50 means the weighted findings equal the allowance for this much code. */
  value: number;
  blocking: number;
  warnings: number;
  byRule: Record<string, number>;
  lines: number;
}

const BLOCK_WEIGHT = 5;
const WARN_WEIGHT = 1;
/** Findings tolerated per 1,000 lines before the score halves, plus a floor so tiny repos are not punished. */
const ALLOWANCE_PER_KLOC = 20;
const ALLOWANCE_FLOOR = 10;

export function scoreFindings(findings: readonly Finding[], index: CodemapIndex): Score {
  const lines = index.files.reduce((sum, f) => sum + f.lines, 0);
  const blocking = findings.filter((f) => f.level === "block").length;
  const warnings = findings.length - blocking;
  const byRule: Record<string, number> = {};
  for (const f of findings) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  const weighted = blocking * BLOCK_WEIGHT + warnings * WARN_WEIGHT;
  const allowance = (lines / 1000) * ALLOWANCE_PER_KLOC + ALLOWANCE_FLOOR;
  return { value: Math.round((100 * allowance) / (allowance + weighted)), blocking, warnings, byRule, lines };
}

export function formatScore(score: Score): string {
  const rules = Object.entries(score.byRule)
    .sort((a, b) => b[1] - a[1])
    .map(([rule, n]) => `${rule}×${n}`)
    .join("  ");
  return `SlopScore ${score.value}/100  (${score.blocking} blocking, ${score.warnings} warnings, ${score.lines} lines)${rules ? `\n${rules}` : ""}`;
}
