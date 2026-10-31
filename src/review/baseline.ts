import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "../core/config.js";
import type { Finding } from "../core/findings.js";

export const RENDER_BASELINE_FILE = join(CONFIG_DIR, "render-baseline.json");

const keyOf = (f: Finding): string => `${f.rule}|${f.file}|${f.key ?? f.message}`;

/** Record the page's existing measured problems, so only new ones block later. Commit this file. */
export function saveRenderBaseline(root: string, findings: readonly Finding[]): number {
  const keys = [...new Set(findings.map(keyOf))].sort();
  mkdirSync(join(root, CONFIG_DIR), { recursive: true });
  writeFileSync(join(root, RENDER_BASELINE_FILE), `${JSON.stringify({ known: keys }, null, 2)}\n`);
  return keys.length;
}

export function newRenderFindings(root: string, findings: readonly Finding[]): Finding[] {
  const file = join(root, RENDER_BASELINE_FILE);
  if (!existsSync(file)) throw new Error(`${RENDER_BASELINE_FILE} not found. Run \`deslopify baseline\` once, on a checkout whose page you accept as it is.`);
  const known = new Set((JSON.parse(readFileSync(file, "utf8")) as { known: string[] }).known);
  return findings.filter((f) => !known.has(keyOf(f)));
}
