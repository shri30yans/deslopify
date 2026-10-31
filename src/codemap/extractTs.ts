import ts from "typescript";
import type { SourceFile } from "../core/files.js";
import type { CodeSymbol, SymbolKind } from "./types.js";

export interface RawImport {
  specifier: string;
  names: string[];
  line: number;
}

export interface TsExtraction {
  exports: CodeSymbol[];
  imports: RawImport[];
}

export function parseTs(file: SourceFile): ts.SourceFile {
  const kind = file.lang === "tsx" ? ts.ScriptKind.TSX : file.lang === "jsx" ? ts.ScriptKind.JSX : file.lang === "js" ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, kind);
}

export const lineOf = (sf: ts.SourceFile, node: ts.Node): number =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

function docOf(node: ts.Node): string | undefined {
  const text = ts.getJSDocCommentsAndTags(node)
    .map((d) => (typeof d.comment === "string" ? d.comment : ""))
    .find((c) => c.trim());
  return text?.split("\n")[0].trim();
}

const truncate = (s: string, max = 70): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

function paramsText(sf: ts.SourceFile, params: ts.NodeArray<ts.ParameterDeclaration>): string {
  const parts = params.map((p) => {
    if (ts.isObjectBindingPattern(p.name)) return `{${p.name.elements.map((e) => e.name.getText(sf)).join(", ")}}`;
    const optional = p.questionToken || p.initializer ? "?" : "";
    return `${p.name.getText(sf)}${optional}`;
  });
  return truncate(`(${parts.join(", ")})`);
}

function functionKind(name: string, isTsx: boolean): SymbolKind {
  if (/^use[A-Z]/.test(name)) return "hook";
  if (/^[A-Z]/.test(name) && isTsx) return "component";
  return "function";
}

/** What a constant is, in a few words: its declared type, or the shape of its value. */
function constSignature(sf: ts.SourceFile, decl: ts.VariableDeclaration): string {
  if (decl.type) return truncate(decl.type.getText(sf).replace(/\s+/g, " "));
  const init = decl.initializer;
  if (!init) return "";
  const value = ts.isAsExpression(init) || ts.isSatisfiesExpression(init) ? init.expression : init;
  if (ts.isArrayLiteralExpression(value)) return `array of ${value.elements.length}`;
  if (ts.isObjectLiteralExpression(value)) return truncate(`{${value.properties.map((p) => p.name?.getText(sf) ?? "…").join(", ")}}`);
  return truncate(init.getText(sf).split("\n")[0]);
}

function fromVariable(sf: ts.SourceFile, decl: ts.VariableDeclaration, isTsx: boolean): CodeSymbol | null {
  if (!ts.isIdentifier(decl.name)) return null;
  const name = decl.name.text;
  const init = decl.initializer;
  const base = { name, file: sf.fileName, line: lineOf(sf, decl), doc: docOf(decl.parent.parent) };
  if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
    return { ...base, kind: functionKind(name, isTsx), signature: paramsText(sf, init.parameters) };
  }
  return { ...base, kind: "const", signature: constSignature(sf, decl) };
}

function fromStatement(sf: ts.SourceFile, node: ts.Statement, isTsx: boolean): CodeSymbol[] {
  if (!isExported(node)) return [];
  const at = (n: ts.Node) => ({ file: sf.fileName, line: lineOf(sf, n), doc: docOf(n) });
  if (ts.isFunctionDeclaration(node) && node.name) {
    const name = node.name.text;
    return [{ name, kind: functionKind(name, isTsx), signature: paramsText(sf, node.parameters), ...at(node) }];
  }
  if (ts.isClassDeclaration(node) && node.name) return [{ name: node.name.text, kind: "class", signature: "class", ...at(node) }];
  if (ts.isInterfaceDeclaration(node)) {
    const members = node.members.map((m) => m.name?.getText(sf)).filter(Boolean).join(", ");
    return [{ name: node.name.text, kind: "interface", signature: truncate(`{${members}}`), ...at(node) }];
  }
  if (ts.isTypeAliasDeclaration(node)) return [{ name: node.name.text, kind: "type", signature: truncate(node.type.getText(sf).replace(/\s+/g, " ")), ...at(node) }];
  if (ts.isEnumDeclaration(node)) return [{ name: node.name.text, kind: "enum", signature: "enum", ...at(node) }];
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.map((d) => fromVariable(sf, d, isTsx)).filter((s): s is CodeSymbol => s !== null);
  }
  return [];
}

function importOf(sf: ts.SourceFile, node: ts.Statement): RawImport | null {
  const spec = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier;
  if (!spec || !ts.isStringLiteral(spec)) return null;
  const names: string[] = [];
  if (ts.isImportDeclaration(node) && node.importClause) {
    const clause = node.importClause;
    if (clause.name) names.push("default");
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) names.push((el.propertyName ?? el.name).text);
    }
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) names.push("*");
  }
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const el of node.exportClause.elements) names.push((el.propertyName ?? el.name).text);
  }
  return { specifier: spec.text, names, line: lineOf(sf, node) };
}

export function extractTs(file: SourceFile): TsExtraction {
  const sf = parseTs(file);
  const isTsx = file.lang === "tsx" || file.lang === "jsx";
  const exports: CodeSymbol[] = [];
  const imports: RawImport[] = [];
  for (const statement of sf.statements) {
    exports.push(...fromStatement(sf, statement, isTsx));
    const imp = importOf(sf, statement);
    if (imp) imports.push(imp);
  }
  return { exports, imports };
}
