import { createHash } from "node:crypto";
import { matchesAny } from "../core/glob.js";
import { SCRIPT_LANGS, type ProjectFinding, type ProjectRule } from "./types.js";

const WINDOW = 8;
const MIN_LINE = 12;

/** A line's shape: whitespace collapsed, string/number literals blanked so renamed copies still match. */
const normalize = (line: string): string =>
  line.trim().replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '"s"').replace(/\b\d+(\.\d+)?\b/g, "0").replace(/\s+/g, " ");

const isTrivial = (line: string): boolean => line.length < MIN_LINE || /^(import |export \{|\}\)?;?$|\/\/|\*|\/\*)/.test(line);

interface Occurrence {
  file: string;
  line: number;
}

export const duplicate: ProjectRule = {
  id: "DS-DUPLICATE",
  phase: "finish",
  instruction: "Do not copy-paste blocks between files; extract the shared part once (rule of three: on the third copy at the latest).",
  why: "Cloned blocks get fixed in one place and stay broken in the others.",
  defaultLevel: "warn",
  checkProject(files, { config }) {
    const seen = new Map<string, Occurrence[]>();
    for (const file of files) {
      if (!SCRIPT_LANGS.includes(file.lang) || matchesAny(file.path, config.testPaths)) continue;
      const lines = file.lines.map(normalize);
      for (let i = 0; i + WINDOW <= lines.length; i++) {
        const window = lines.slice(i, i + WINDOW);
        if (window.filter((l) => !isTrivial(l)).length < WINDOW - 2) continue;
        const key = createHash("sha1").update(window.join("\n")).digest("hex");
        seen.set(key, [...(seen.get(key) ?? []), { file: file.path, line: i + 1 }]);
      }
    }
    const out: ProjectFinding[] = [];
    const reported = new Set<string>();
    for (const occurrences of seen.values()) {
      const files = new Set(occurrences.map((o) => o.file));
      if (files.size < 2) continue;
      for (const o of occurrences) {
        const others = occurrences.filter((x) => x.file !== o.file);
        const key = `${o.file}:${Math.floor(o.line / WINDOW)}`;
        if (reported.has(key)) continue;
        reported.add(key);
        out.push({
          file: o.file,
          line: o.line,
          message: `${WINDOW}+ lines duplicate ${others[0].file}:${others[0].line}.`,
          fix: "Extract the shared block into one function or component and call it from both places.",
        });
      }
    }
    return out;
  },
};
