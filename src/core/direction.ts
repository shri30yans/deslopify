import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR } from "./config.js";

/**
 * The design contract: every choice an agent would otherwise default to the average on.
 * Written once when a World is picked; the agent obeys it, hooks enforce the parts that can be checked.
 */
export interface Direction {
  world: string;
  name: string;
  thesis: string;
  fonts: { display: string; text: string; mono?: string };
  palette: { bg: string; surface: string; ink: string; muted: string; accent: string; accentInk: string; line: string };
  radius: "none" | "sm" | "md" | "lg" | "pill";
  density: "airy" | "balanced" | "dense";
  grid: string;
  hero: string;
  imagery: string;
  motion: string;
  voice: string;
  signature: string;
}

export const DIRECTION_FILE = join(CONFIG_DIR, "direction.json");
export const TOKENS_FILE = join(CONFIG_DIR, "tokens.css");
export const GRAMMAR_FILE = join(CONFIG_DIR, "grammar.md");
/** The board the user chose: the target the stop-time review compares the build against. */
export const BOARD_FILE = join(CONFIG_DIR, "board.png");

const STRING_FIELDS = ["world", "name", "thesis", "grid", "hero", "imagery", "motion", "voice", "signature"] as const;
const PALETTE_FIELDS = ["bg", "surface", "ink", "muted", "accent", "accentInk", "line"] as const;

export function validateDirection(value: unknown): Direction {
  const d = value as Partial<Direction> | null;
  if (!d || typeof d !== "object") throw new Error("direction.json must be an object");
  for (const key of STRING_FIELDS) {
    if (typeof d[key] !== "string" || !d[key]) throw new Error(`direction.json: "${key}" is required`);
  }
  if (!d.fonts?.display || !d.fonts.text) throw new Error('direction.json: "fonts.display" and "fonts.text" are required');
  for (const key of PALETTE_FIELDS) {
    if (!d.palette?.[key]) throw new Error(`direction.json: "palette.${key}" is required`);
  }
  if (!["none", "sm", "md", "lg", "pill"].includes(d.radius as string)) throw new Error('direction.json: "radius" must be none|sm|md|lg|pill');
  if (!["airy", "balanced", "dense"].includes(d.density as string)) throw new Error('direction.json: "density" must be airy|balanced|dense');
  return d as Direction;
}

/** A project that has not picked a World has no direction yet; that is a state, not an error. */
export function loadDirection(root: string): Direction | null {
  const file = join(root, DIRECTION_FILE);
  return existsSync(file) ? validateDirection(JSON.parse(readFileSync(file, "utf8"))) : null;
}

export function saveDirection(root: string, direction: Direction): void {
  const file = join(root, DIRECTION_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(validateDirection(direction), null, 2)}\n`);
}

export const allowedFonts = (d: Direction): string[] => [d.fonts.display, d.fonts.text, ...(d.fonts.mono ? [d.fonts.mono] : [])];
