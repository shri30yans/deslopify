import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR, type Config } from "../core/config.js";
import { isScript, listSourceFiles, readSourceFile, type SourceFile } from "../core/files.js";
import { extractPy } from "./extractPy.js";
import { extractTs, type TsExtraction } from "./extractTs.js";
import { pageRank } from "./rank.js";
import { packageName, resolveImport } from "./resolve.js";
import type { CodemapIndex, FileInfo, RankedSymbol } from "./types.js";

export const INDEX_FILE = join(CONFIG_DIR, "codemap.json");
export const MAP_FILE = join(CONFIG_DIR, "codemap.md");

function extract(file: SourceFile): TsExtraction {
  if (isScript(file.lang)) return extractTs(file);
  if (file.lang === "py") return extractPy(file);
  return { exports: [], imports: [] };
}

export function extractFile(file: SourceFile, known: ReadonlySet<string>, config: Config): FileInfo {
  const { exports, imports } = extract(file);
  return {
    path: file.path,
    lang: file.lang,
    lines: file.lines.length,
    exports,
    imports: imports.map((imp) => {
      const local = resolveImport(file.path, imp.specifier, known, config.aliases);
      return { target: local ?? packageName(imp.specifier), local: local !== null, names: imp.names, line: imp.line };
    }),
  };
}

/** Uses of each "file#symbol" across the repo, counted from named imports. */
function countUses(files: readonly FileInfo[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const f of files) {
    for (const imp of f.imports.filter((i) => i.local)) {
      for (const name of imp.names) uses.set(`${imp.target}#${name}`, (uses.get(`${imp.target}#${name}`) ?? 0) + 1);
    }
  }
  return uses;
}

export function rankSymbols(files: readonly FileInfo[], config: Config, bias?: Map<string, number>): { symbols: RankedSymbol[]; fileRank: Map<string, number> } {
  const edges = new Map(files.map((f) => [f.path, f.imports.filter((i) => i.local).map((i) => i.target)]));
  const fileRank = pageRank(files.map((f) => f.path), edges, bias);
  const uses = countUses(files);
  const symbols = files.flatMap((f) =>
    f.exports.map((s) => {
      const usedBy = uses.get(`${f.path}#${s.name}`) ?? 0;
      const canonical = config.canonical.includes(`${f.path}#${s.name}`) || usedBy >= 2;
      return { ...s, usedBy, canonical, score: (fileRank.get(f.path) ?? 0) * (1 + usedBy) * (canonical ? 1.5 : 1) };
    }),
  );
  symbols.sort((a, b) => b.score - a.score);
  return { symbols, fileRank };
}

export function buildIndex(root: string, config: Config): CodemapIndex {
  const paths = listSourceFiles(root, config);
  const known = new Set(paths);
  const files = paths.map((p) => extractFile(readSourceFile(root, p), known, config));
  const { symbols, fileRank } = rankSymbols(files, config);
  return { version: 1, generatedAt: new Date().toISOString(), files, symbols, fileRank: Object.fromEntries(fileRank) };
}

export function saveIndex(root: string, index: CodemapIndex): void {
  mkdirSync(join(root, CONFIG_DIR), { recursive: true });
  writeFileSync(join(root, INDEX_FILE), JSON.stringify(index));
}

export function loadIndex(root: string): CodemapIndex {
  const file = join(root, INDEX_FILE);
  if (!existsSync(file)) throw new Error(`${INDEX_FILE} not found. Run \`deslopify map\` first.`);
  return JSON.parse(readFileSync(file, "utf8")) as CodemapIndex;
}

/** Replace one file's entry after an edit, so the index stays fresh between full rebuilds. */
export function updateIndexFile(config: Config, index: CodemapIndex, file: SourceFile): CodemapIndex {
  const known = new Set([...index.files.map((f) => f.path), file.path]);
  const files = [...index.files.filter((f) => f.path !== file.path), extractFile(file, known, config)];
  const { symbols, fileRank } = rankSymbols(files, config);
  return { ...index, generatedAt: new Date().toISOString(), files, symbols, fileRank: Object.fromEntries(fileRank) };
}
