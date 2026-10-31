import type { SourceFile } from "../core/files.js";
import type { CodeSymbol } from "./types.js";
import type { RawImport, TsExtraction } from "./extractTs.js";

/** Lightweight Python extraction: top-level defs, classes and imports. Private names are skipped. */
export function extractPy(file: SourceFile): TsExtraction {
  const exports: CodeSymbol[] = [];
  const imports: RawImport[] = [];
  file.lines.forEach((text, i) => {
    const line = i + 1;
    const def = /^(?:async\s+)?def\s+([A-Za-z]\w*)\s*(\([^)]*\)?)/.exec(text);
    if (def) exports.push({ name: def[1], kind: "function", file: file.path, line, signature: def[2].slice(0, 70) });
    const cls = /^class\s+([A-Za-z]\w*)/.exec(text);
    if (cls) exports.push({ name: cls[1], kind: "class", file: file.path, line, signature: "class" });
    const from = /^from\s+(\S+)\s+import\s+(.+)$/.exec(text);
    if (from) imports.push({ specifier: from[1], names: from[2].split(",").map((n) => n.trim().split(/\s+/)[0]), line });
    const plain = /^import\s+([\w.]+)/.exec(text);
    if (plain) imports.push({ specifier: plain[1], names: ["*"], line });
  });
  return { exports, imports };
}
