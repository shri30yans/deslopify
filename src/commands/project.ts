import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { MAP_FILE, buildIndex, saveIndex } from "../codemap/build.js";
import { renderCodemap } from "../codemap/render.js";
import type { CodemapIndex } from "../codemap/types.js";
import { CONFIG_FILE, loadConfig } from "../core/config.js";
import type { Direction } from "../core/direction.js";

/** The nearest ancestor of `start` that has been initialized, or null when there is none. */
export function findRoot(start: string): string | null {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

export function requireRoot(start: string): string {
  const root = findRoot(start);
  if (!root) throw new Error(`No ${CONFIG_FILE} found at or above ${start}. Run \`deslopify init\` in the project root.`);
  return root;
}

/** Rebuild the index and the human/agent-readable codemap from the files on disk. */
export function refreshCodemap(root: string): CodemapIndex {
  const index = buildIndex(root, loadConfig(root));
  writeCodemap(root, index);
  return index;
}

export function writeCodemap(root: string, index: CodemapIndex): void {
  saveIndex(root, index);
  writeFileSync(join(root, MAP_FILE), `${renderCodemap(index, loadConfig(root))}\n`);
}

export function describeDirection(direction: Direction | null, grammar: string | null): string {
  if (!direction) {
    return [
      "## Direction: none chosen yet",
      'Before building or restyling any UI, run `deslopify pick "<one-line description of the product>"` and wait for the user to choose a look.',
    ].join("\n");
  }
  const p = direction.palette;
  return [
    `## Direction: ${direction.name} (${direction.world})`,
    direction.thesis,
    `- Fonts: display ${direction.fonts.display}; text ${direction.fonts.text}${direction.fonts.mono ? `; mono ${direction.fonts.mono}` : ""}`,
    `- Palette: bg ${p.bg}, surface ${p.surface}, ink ${p.ink}, muted ${p.muted}, accent ${p.accent} (text on it ${p.accentInk}), line ${p.line}`,
    `- Radius ${direction.radius}; density ${direction.density}; grid: ${direction.grid}`,
    `- Hero: ${direction.hero}`,
    `- Imagery: ${direction.imagery}`,
    `- Motion: ${direction.motion}`,
    `- Voice: ${direction.voice}`,
    `- Signature: ${direction.signature}`,
    `Layout grammar:\n${grammar ?? ""}`.trimEnd(),
    "Obey this contract; tokens are in .deslopify/tokens.css. To change the look, run `deslopify pick` again.",
  ].join("\n");
}
