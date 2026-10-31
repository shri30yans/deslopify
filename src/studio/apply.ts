import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BOARD_FILE, GRAMMAR_FILE, TOKENS_FILE, saveDirection } from "../core/direction.js";
import { CONFIG_DIR } from "../core/config.js";
import { tokensCss } from "./render.js";
import type { World } from "./worlds.js";

/** Make `world` the project's direction: the contract, the tokens, the layout grammar and the target board. */
export function applyWorld(root: string, world: World, board: Buffer): void {
  mkdirSync(join(root, CONFIG_DIR), { recursive: true });
  saveDirection(root, world.direction);
  writeFileSync(join(root, TOKENS_FILE), `/* Generated from direction.json by \`deslopify pick\`. Import these variables; do not hand-edit. */\n${tokensCss(world.direction)}\n`);
  writeFileSync(join(root, GRAMMAR_FILE), world.grammar);
  writeFileSync(join(root, BOARD_FILE), board);
}
