import type { Phase } from "./phase.js";
import type { Level } from "../core/config.js";
import { aiGradient, arbitraryValue, emojiIcon, glow, gradientText, imgAlt, placeholder, tokenColor } from "./design.js";
import { nestedCards } from "./cards.js";
import { deadComment, debug, hedge, stub, suppress } from "./comments.js";
import { contentInLayout, fonts, stockCopy } from "./copy.js";
import { duplicate } from "./duplicate.js";
import { adapter, layer, mockProd } from "./imports.js";
import { doNotEdit } from "./paths.js";
import { reinvent } from "./reinvent.js";
import { reuse } from "./reuse.js";
import { TOOL_RULES } from "./tools.js";
import { boolSoup, size, swallow } from "./structure.js";
import type { ProjectRule, Rule } from "./types.js";

/** The one list of rules. Everything that enforces, reports or documents a rule reads it from here. */
export const FILE_RULES: readonly Rule[] = [
  reuse, layer, adapter, size, swallow, boolSoup, reinvent, mockProd,
  hedge, stub, deadComment, suppress, debug,
  tokenColor, arbitraryValue, fonts, gradientText, aiGradient, glow, emojiIcon, nestedCards, imgAlt,
  placeholder, stockCopy, contentInLayout,
];

export const PROJECT_RULES: readonly ProjectRule[] = [duplicate];

export const PATH_RULES = [doNotEdit] as const;

export interface RuleDoc {
  id: string;
  phase: Phase;
  instruction: string;
  why: string;
  defaultLevel: Level;
}

export const ALL_RULES: readonly RuleDoc[] = [...PATH_RULES, ...FILE_RULES, ...PROJECT_RULES, ...TOOL_RULES];

export const RULE_IDS: ReadonlySet<string> = new Set(ALL_RULES.map((r) => r.id));
