import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.js";

export interface SessionState {
  touched: string[];
  reviewRounds: number;
}

const stateFile = (root: string, sessionId: string): string =>
  join(root, CONFIG_DIR, "state", `${sessionId.replace(/[^\w-]/g, "_") || "default"}.json`);

export function readState(root: string, sessionId: string): SessionState {
  const file = stateFile(root, sessionId);
  if (!existsSync(file)) return { touched: [], reviewRounds: 0 };
  return JSON.parse(readFileSync(file, "utf8")) as SessionState;
}

export function writeState(root: string, sessionId: string, state: SessionState): void {
  const file = stateFile(root, sessionId);
  mkdirSync(join(root, CONFIG_DIR, "state"), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2));
}

export function markTouched(root: string, sessionId: string, path: string): void {
  const state = readState(root, sessionId);
  if (!state.touched.includes(path)) state.touched.push(path);
  writeState(root, sessionId, state);
}
