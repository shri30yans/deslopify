import type { Phase } from "./phase.js";
import type { Level } from "../core/config.js";

/** Rules whose findings come from a compiler or linter rather than our own checks. */
export interface ToolRule {
  id: string;
  phase: Phase;
  instruction: string;
  why: string;
  defaultLevel: Level;
}

export const typeCheck: ToolRule = {
  id: "DS-TYPE",
  phase: "finish",
  instruction: "Leave no new type errors, in your file or in files that call it; fix them, never suppress.",
  why: "A type error is a bug the compiler already found; leaving it breaks the build or hides a wrong call.",
  defaultLevel: "block",
};

export const lintClean: ToolRule = {
  id: "DS-LINT",
  phase: "finish",
  instruction: "Leave no new findings from the project's enabled linters (eslint, ruff).",
  why: "The project's own lint rules encode decisions the team already made.",
  defaultLevel: "warn",
};

export const refs: ToolRule = {
  id: "DS-REFS",
  phase: "before",
  instruction: "Before changing an exported signature, find its callers with the language service and update every one.",
  why: "A changed signature silently breaks callers the agent never opened.",
  defaultLevel: "warn",
};

export const overflow: ToolRule = {
  id: "DS-OVERFLOW",
  phase: "finish",
  instruction: "No horizontal scrolling at any viewport width, from 320px up.",
  why: "Sideways overflow on a phone is the most visible layout bug and the one a desktop-only check never sees.",
  defaultLevel: "block",
};

export const brokenImage: ToolRule = {
  id: "DS-IMG-BROKEN",
  phase: "finish",
  instruction: "Every image must load; fix the path or remove the element.",
  why: "A broken image is an empty hole in the composition.",
  defaultLevel: "block",
};

export const consoleError: ToolRule = {
  id: "DS-CONSOLE",
  phase: "finish",
  instruction: "The page must load without console errors or uncaught exceptions.",
  why: "Console errors are runtime bugs the type checker cannot see.",
  defaultLevel: "block",
};

export const accessibility: ToolRule = {
  id: "DS-A11Y",
  phase: "finish",
  instruction: "Fix serious and critical accessibility violations (contrast, names, labels) the review reports.",
  why: "Contrast and missing names make the page unusable for real people.",
  defaultLevel: "block",
};

export const visualReview: ToolRule = {
  id: "DS-REVIEW",
  phase: "finish",
  instruction: "After UI changes, open the review screenshots, compare them with direction.json, and fix the top three gaps.",
  why: "A build that compiles is not a design that works; only looking at the render shows hierarchy, spacing and crop problems.",
  defaultLevel: "warn",
};

export const TOOL_RULES = [typeCheck, lintClean, refs, overflow, brokenImage, consoleError, accessibility, visualReview] as const;
