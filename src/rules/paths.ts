import type { Phase } from "./phase.js";
import type { Config, Level } from "../core/config.js";
import { matchesAny } from "../core/glob.js";

/** A rule about where a file is, not what is in it. Enforced before a write, so nothing lands in the wrong place. */
export interface PathRule {
  id: string;
  phase: Phase;
  instruction: string;
  why: string;
  defaultLevel: Level;
  checkPath(path: string, config: Config): { message: string; fix: string } | null;
}

export const doNotEdit: PathRule = {
  id: "DS-GENERATED",
  phase: "before",
  instruction: "Never edit generated or build output; change its source and regenerate.",
  why: "Edits to generated files are overwritten on the next build and hide the real change.",
  defaultLevel: "block",
  checkPath(path, config) {
    if (!matchesAny(path, config.doNotEdit)) return null;
    return { message: `${path} is generated or build output.`, fix: "Edit the source that produces it, then regenerate." };
  },
};
