import type { Phase } from "./phase.js";
import type { Config, Level } from "../core/config.js";
import type { Direction } from "../core/direction.js";
import type { Lang, SourceFile } from "../core/files.js";
import type { CodemapIndex } from "../codemap/types.js";

export interface RawFinding {
  line: number;
  message: string;
  fix: string;
}

export interface RuleContext {
  config: Config;
  index: CodemapIndex;
  /** null until a World is picked; rules that need it do not apply before then. */
  direction: Direction | null;
}

export interface ProjectFinding extends RawFinding {
  file: string;
}

/** One rule = one sentence = one check. `why` is shown with every finding. */
export interface Rule {
  id: string;
  phase: Phase;
  /** The instruction the agent reads in AGENTS.md / rules.md. */
  instruction: string;
  why: string;
  langs: readonly Lang[];
  defaultLevel: Level;
  /** Skip files matching config.testPaths (tests, scripts, fixtures). */
  skipTests?: boolean;
  check(file: SourceFile, ctx: RuleContext): RawFinding[];
}

/** Needs to see several files at once (e.g. duplicate code). Findings carry their own file. */
export interface ProjectRule {
  id: string;
  phase: Phase;
  instruction: string;
  why: string;
  defaultLevel: Level;
  checkProject(files: readonly SourceFile[], ctx: RuleContext): ProjectFinding[];
}

export const SCRIPT_LANGS: readonly Lang[] = ["ts", "tsx", "js", "jsx"];
export const UI_LANGS: readonly Lang[] = ["tsx", "jsx", "html", "css"];
export const MARKUP_LANGS: readonly Lang[] = ["tsx", "jsx", "html"];
export const CODE_LANGS: readonly Lang[] = ["ts", "tsx", "js", "jsx", "py"];

/** Run a regex over every line and turn each hit into a finding. */
export function lineMatches(
  file: SourceFile,
  pattern: RegExp,
  toFinding: (match: RegExpExecArray, line: number) => RawFinding | null,
): RawFinding[] {
  const out: RawFinding[] = [];
  file.lines.forEach((text, i) => {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const f = toFinding(m, i + 1);
      if (f) out.push(f);
      if (m[0].length === 0) re.lastIndex++;
    }
  });
  return out;
}

/** The comment part of a line, or null. Ignores `//` inside URLs. */
export function commentOf(text: string, lang: Lang): string | null {
  if (lang === "py") {
    const m = /(?:^|\s)#\s?(.*)$/.exec(text);
    return m ? m[1] : null;
  }
  const m = /(?:^|[^:"'`\w])\/\/\s?(.*)$|^\s*\/?\*+\s?(.*?)(?:\*\/)?$/.exec(text);
  if (!m) return null;
  return (m[1] ?? m[2] ?? "").trim();
}
