import { join, relative, resolve } from "node:path";
import ts from "typescript";
import type { ProjectFinding } from "../rules/types.js";
import { toPosix } from "../core/files.js";

export interface TsProject {
  root: string;
  has(path: string): boolean;
  diagnostics(path: string): ProjectFinding[];
  /** Repo-relative files, other than `path`, that reference the export `name` declared in `path`. */
  callers(path: string, name: string): string[];
}

function loadCompilerOptions(root: string): ts.ParsedCommandLine {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error(`The typescript linter is enabled but no tsconfig.json exists under ${root}.`);
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  return ts.parseJsonConfigFileContent(read.config, ts.sys, join(configPath, ".."));
}

/** `overrides` maps absolute paths to proposed content that is not on disk yet. */
export function openTsProject(root: string, overrides: ReadonlyMap<string, string> = new Map()): TsProject {
  const parsed = loadCompilerOptions(root);
  const fileNames = new Set(parsed.fileNames.map((f) => resolve(f)));
  for (const path of overrides.keys()) if (/\.(tsx?|jsx?|mts|cts)$/.test(path)) fileNames.add(resolve(path));
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...fileNames],
    getScriptVersion: (f) => (overrides.has(resolve(f)) ? "override" : "disk"),
    getScriptSnapshot: (f) => {
      const text = overrides.get(resolve(f)) ?? ts.sys.readFile(f);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => root,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  const rel = (abs: string): string => toPosix(relative(root, abs));

  return {
    root,
    has: (path) => fileNames.has(resolve(root, path)),
    diagnostics(path) {
      const abs = resolve(root, path);
      const sf = service.getProgram()?.getSourceFile(abs);
      return [...service.getSyntacticDiagnostics(abs), ...service.getSemanticDiagnostics(abs)]
        .filter((d) => d.category === ts.DiagnosticCategory.Error)
        .map((d) => ({
          file: path,
          line: sf && d.start !== undefined ? sf.getLineAndCharacterOfPosition(d.start).line + 1 : 1,
          message: `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
          fix: "Fix the type error; do not suppress it.",
        }));
    },
    callers(path, name) {
      const abs = resolve(root, path);
      const sf = service.getProgram()?.getSourceFile(abs);
      if (!sf) return [];
      const decl = sf.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name) ?? findVariable(sf, name);
      const target = decl && "name" in decl && decl.name ? decl.name : null;
      if (!target) return [];
      const refs = service.findReferences(abs, target.getStart(sf)) ?? [];
      const files = new Set(refs.flatMap((r) => r.references.map((ref) => rel(ref.fileName))));
      files.delete(path);
      return [...files].filter((f) => !f.includes("node_modules"));
    },
  };
}

function findVariable(sf: ts.SourceFile, name: string): ts.VariableDeclaration | undefined {
  for (const s of sf.statements) {
    if (!ts.isVariableStatement(s)) continue;
    const d = s.declarationList.declarations.find((x) => ts.isIdentifier(x.name) && x.name.text === name);
    if (d) return d;
  }
  return undefined;
}
