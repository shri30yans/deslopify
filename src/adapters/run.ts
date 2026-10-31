import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ToolResult {
  stdout: string;
  status: number;
}

/**
 * Run an external linter. Linters exit non-zero when they find problems, so a non-zero
 * status is a result; only a missing binary or a crash is an error.
 */
export function runTool(tool: string, binary: string, args: string[], cwd: string): ToolResult {
  const result = spawnSync(binary, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) {
    throw new Error(`${tool} is enabled in .deslopify/config.json "linters" but could not run (${result.error.message}). Install it or remove it from "linters".`);
  }
  return { stdout: result.stdout, status: result.status ?? 1 };
}

/** The project's own local binary (node_modules/.bin/<name>); a project that enables a JS linter must install it. */
export function localBin(root: string, name: string): string {
  const bin = join(root, "node_modules", ".bin", name);
  if (!existsSync(bin)) throw new Error(`${name} is enabled in .deslopify/config.json "linters" but ${bin} does not exist. Install it or remove it from "linters".`);
  return bin;
}

export function onPath(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
