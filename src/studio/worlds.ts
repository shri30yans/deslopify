import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDirection, type Direction } from "../core/direction.js";

/** A World: a complete, tested design direction plus the board template that shows it. */
export interface World {
  id: string;
  dir: string;
  blurb: string;
  /** What the World suits; matched against the user's description to choose which three to show. */
  tags: string[];
  direction: Direction;
  heroTemplate: string;
  grammar: string;
}

const worldsRoot = (): string => join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "worlds");

export function loadWorld(id: string): World {
  const dir = join(worldsRoot(), id);
  const file = join(dir, "world.json");
  if (!existsSync(file)) throw new Error(`Unknown World "${id}". Available: ${listWorldIds().join(", ")}.`);
  const meta = JSON.parse(readFileSync(file, "utf8")) as { id: string; blurb: string; tags: string[]; direction: unknown };
  if (meta.id !== id) throw new Error(`${file}: "id" must be "${id}".`);
  return {
    id,
    dir,
    blurb: meta.blurb,
    tags: meta.tags,
    direction: validateDirection(meta.direction),
    heroTemplate: readFileSync(join(dir, "hero.html"), "utf8"),
    grammar: readFileSync(join(dir, "grammar.md"), "utf8"),
  };
}

export const listWorldIds = (): string[] =>
  readdirSync(worldsRoot(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

export const loadWorlds = (): World[] => listWorldIds().map(loadWorld);

const words = (text: string): Set<string> => new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);

/** The `count` Worlds whose tags best match the description; ties keep alphabetical order. */
export function rankWorlds(about: string, worlds: readonly World[], count = 3): World[] {
  const mentioned = words(about);
  return worlds
    .map((world) => ({ world, score: world.tags.filter((t) => mentioned.has(t)).length }))
    .sort((a, b) => b.score - a.score || a.world.id.localeCompare(b.world.id))
    .slice(0, count)
    .map((r) => r.world);
}
