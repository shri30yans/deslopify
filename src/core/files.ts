import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { Config } from "./config.js";
import { matchesAny } from "./glob.js";

export type Lang = "ts" | "tsx" | "js" | "jsx" | "css" | "html" | "py" | "md" | "other";

const LANG_BY_EXT: Record<string, Lang> = {
  ".ts": "ts", ".mts": "ts", ".cts": "ts",
  ".tsx": "tsx", ".jsx": "jsx",
  ".js": "js", ".mjs": "js", ".cjs": "js",
  ".css": "css", ".scss": "css",
  ".html": "html", ".vue": "html", ".svelte": "html", ".astro": "html",
  ".py": "py",
  ".md": "md", ".mdx": "md",
};

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".deslopify", ".turbo", ".vercel"]);

export interface SourceFile {
  path: string;
  text: string;
  lines: string[];
  lang: Lang;
}

export const toPosix = (p: string): string => p.split(sep).join("/");

export function langOf(path: string): Lang {
  if (/\.d\.ts$/.test(path)) return "other";
  return LANG_BY_EXT[extname(path).toLowerCase()] ?? "other";
}

export function isScript(lang: Lang): boolean {
  return lang === "ts" || lang === "tsx" || lang === "js" || lang === "jsx";
}

export function isUi(lang: Lang): boolean {
  return lang === "tsx" || lang === "jsx" || lang === "css" || lang === "html";
}

export function makeSourceFile(path: string, text: string): SourceFile {
  return { path, text, lines: text.split("\n"), lang: langOf(path) };
}

export function readSourceFile(root: string, path: string): SourceFile {
  return makeSourceFile(path, readFileSync(join(root, path), "utf8"));
}

/** Whether a repo-relative path is one deslopify looks at (included, and not excluded). */
export function isSourcePath(config: Config, path: string): boolean {
  return matchesAny(path, config.include) && !matchesAny(path, config.exclude);
}

export function listSourceFiles(root: string, config: Config): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
      const abs = join(dir, name);
      const stat = statSync(abs);
      if (stat.isDirectory()) walk(abs);
      else if (stat.size < 512_000) {
        const rel = toPosix(relative(root, abs));
        if (isSourcePath(config, rel)) out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}
