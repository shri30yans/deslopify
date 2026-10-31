import type { Lang } from "../core/files.js";

export type SymbolKind = "function" | "component" | "hook" | "class" | "type" | "interface" | "const" | "enum";

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  signature: string;
  doc?: string;
}

export interface ImportRef {
  /** Repo-relative path when the import resolves to a project file, otherwise the package name. */
  target: string;
  local: boolean;
  names: string[];
  line: number;
}

export interface FileInfo {
  path: string;
  lang: Lang;
  lines: number;
  exports: CodeSymbol[];
  imports: ImportRef[];
}

export interface RankedSymbol extends CodeSymbol {
  score: number;
  usedBy: number;
  canonical: boolean;
}

export interface CodemapIndex {
  version: 1;
  generatedAt: string;
  files: FileInfo[];
  symbols: RankedSymbol[];
  fileRank: Record<string, number>;
}
