import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_FILE, DEFAULT_CONFIG, type Config } from "../src/core/config.js";
import type { Direction } from "../src/core/direction.js";
import { DIRECTION_FILE } from "../src/core/direction.js";
import { loadContext } from "../src/core/engine.js";
import { refreshCodemap } from "../src/commands/project.js";
import type { RuleContext } from "../src/rules/types.js";

const git = (root: string, ...args: string[]): void => {
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: root, stdio: "ignore" });
};

export interface RepoOptions {
  config?: Partial<Config>;
  direction?: Direction;
  /** Commit the files so later edits are measured against them. Default true. */
  commit?: boolean;
}

/** A throwaway git repo with the given files, an initialized .deslopify and a built codemap. */
export function makeRepo(files: Record<string, string>, options: RepoOptions = {}): { root: string; ctx: () => RuleContext } {
  const root = mkdtempSync(join(tmpdir(), "deslopify-test-"));
  git(root, "init", "-q");
  for (const [path, text] of Object.entries(files)) write(root, path, text);
  write(root, CONFIG_FILE, JSON.stringify({ ...options.config }));
  if (options.direction) write(root, DIRECTION_FILE, JSON.stringify(options.direction));
  refreshCodemap(root);
  if (options.commit !== false) {
    git(root, "add", "-A");
    git(root, "commit", "-qm", "base");
  }
  return { root, ctx: () => loadContext(root) };
}

export function write(root: string, path: string, text: string): void {
  const abs = join(root, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

export const defaults = DEFAULT_CONFIG;
