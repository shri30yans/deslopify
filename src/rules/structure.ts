import ts from "typescript";
import type { SourceFile } from "../core/files.js";
import { lineOf, parseTs } from "../codemap/extractTs.js";
import { SCRIPT_LANGS, type RawFinding, type Rule } from "./types.js";

type FnNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;

const isFn = (n: ts.Node): n is FnNode =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

function fnName(sf: ts.SourceFile, fn: FnNode): string {
  if (fn.name) return fn.name.getText(sf);
  const parent = fn.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) return parent.name.getText(sf);
  return "anonymous function";
}

const isComponentName = (name: string): boolean => /^[A-Z]/.test(name);

const NESTING = new Set([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement, ts.SyntaxKind.SwitchStatement, ts.SyntaxKind.TryStatement,
]);

function maxNesting(node: ts.Node, depth = 0): number {
  let max = depth;
  node.forEachChild((child) => {
    if (isFn(child)) return;
    const isElseIf = ts.isIfStatement(child) && ts.isIfStatement(child.parent) && child.parent.elseStatement === child;
    const next = NESTING.has(child.kind) && !isElseIf ? depth + 1 : depth;
    max = Math.max(max, maxNesting(child, next));
  });
  return max;
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((c) => walk(c, visit));
}

function scriptAst(file: SourceFile): ts.SourceFile | null {
  return SCRIPT_LANGS.includes(file.lang) ? parseTs(file) : null;
}

export const size: Rule = {
  id: "DS-SIZE",
  phase: "write",
  instruction: "Keep files ≤ 300 lines, functions ≤ 50 (components ≤ 120), ≤ 4 parameters and nesting ≤ 3; split by responsibility.",
  why: "Small units have one reason to change (single responsibility) and are easy to review and reuse.",
  langs: ["ts", "tsx", "js", "jsx", "py"],
  defaultLevel: "warn",
  check(file, { config }) {
    const b = config.budgets;
    const out: RawFinding[] = [];
    if (file.lines.length > b.fileLines) {
      out.push({ line: 1, message: `File is ${file.lines.length} lines (budget ${b.fileLines}).`, fix: "Split it by responsibility before adding more." });
    }
    const sf = scriptAst(file);
    if (!sf) return out;
    walk(sf, (n) => {
      if (!isFn(n) || !n.body) return;
      const name = fnName(sf, n);
      const start = lineOf(sf, n);
      const span = sf.getLineAndCharacterOfPosition(n.end).line + 2 - start;
      const budget = isComponentName(name) && (file.lang === "tsx" || file.lang === "jsx") ? b.componentLines : b.functionLines;
      if (span > budget) out.push({ line: start, message: `\`${name}\` is ${span} lines (budget ${budget}).`, fix: "Extract named helpers or child components for its parts." });
      if (n.parameters.length > b.params) out.push({ line: start, message: `\`${name}\` takes ${n.parameters.length} parameters (budget ${b.params}).`, fix: "Pass one options object, or split the function." });
      const depth = maxNesting(n.body);
      if (depth > b.nesting) out.push({ line: start, message: `\`${name}\` nests ${depth} levels deep (budget ${b.nesting}).`, fix: "Use early returns or extract the inner block." });
    });
    return out;
  },
};

function isOnlyLogging(sf: ts.SourceFile, block: ts.Block): boolean {
  return block.statements.every((s) => /^console\.(log|warn|debug)\(/.test(s.getText(sf)));
}

export const swallow: Rule = {
  id: "DS-SWALLOW",
  phase: "write",
  instruction: "Handle every error: rethrow it, return a typed error, or show it to the user; never catch and ignore.",
  why: "Silent failures hide bugs and make the UI report success when it failed.",
  langs: ["ts", "tsx", "js", "jsx", "py"],
  defaultLevel: "warn",
  check(file) {
    if (file.lang === "py") {
      return file.lines.flatMap((text, i) =>
        /^\s*except\b.*:\s*$/.test(text) && /^\s*(pass|\.\.\.)\s*$/.test(file.lines[i + 1] ?? "")
          ? [{ line: i + 1, message: "Exception swallowed with `pass`.", fix: "Handle it, log it with context and re-raise, or let it propagate." }]
          : [],
      );
    }
    const sf = scriptAst(file)!;
    const out: RawFinding[] = [];
    walk(sf, (n) => {
      if (ts.isCatchClause(n) && isOnlyLogging(sf, n.block)) {
        out.push({ line: lineOf(sf, n), message: "Error caught and ignored (empty or console-only catch).", fix: "Rethrow, return a typed error, or surface it to the user." });
      }
      if (ts.isCallExpression(n) && /\.catch$/.test(n.expression.getText(sf)) && n.arguments[0] && /^\(\w*\)\s*=>\s*(\{\s*\}|undefined|null)$/.test(n.arguments[0].getText(sf))) {
        out.push({ line: lineOf(sf, n), message: "Promise rejection swallowed with an empty `.catch`.", fix: "Handle the rejection or let it propagate." });
      }
    });
    return out;
  },
};

function booleanMembers(sf: ts.SourceFile, members: ts.NodeArray<ts.TypeElement>): number {
  return members.filter((m) => ts.isPropertySignature(m) && m.type?.getText(sf) === "boolean").length;
}

export const boolSoup: Rule = {
  id: "DS-BOOL-SOUP",
  phase: "write",
  instruction: "Use variants or composition (children, compound components) instead of 3+ boolean flags.",
  why: "Every boolean doubles the states; flags pile up into components nobody can reason about (open/closed principle).",
  langs: SCRIPT_LANGS,
  defaultLevel: "warn",
  check(file) {
    const sf = scriptAst(file)!;
    const out: RawFinding[] = [];
    walk(sf, (n) => {
      if (isFn(n)) {
        const bools = n.parameters.filter((p) => p.type?.getText(sf) === "boolean").length;
        if (bools >= 3) out.push({ line: lineOf(sf, n), message: `\`${fnName(sf, n)}\` takes ${bools} boolean parameters.`, fix: "Replace the flags with one `variant` value or an options object." });
      }
      const members = ts.isInterfaceDeclaration(n) ? n.members : ts.isTypeLiteralNode(n) ? n.members : null;
      if (members && booleanMembers(sf, members) >= 3) {
        out.push({ line: lineOf(sf, n), message: `Type has ${booleanMembers(sf, members)} boolean flags.`, fix: "Use a `variant` union or compose with children instead." });
      }
    });
    return out;
  },
};
