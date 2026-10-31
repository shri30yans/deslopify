import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedFonts } from "../src/core/direction.js";
import { makeSourceFile } from "../src/core/files.js";
import { FILE_RULES } from "../src/rules/registry.js";
import { loadWorld } from "../src/studio/worlds.js";
import { makeRepo } from "./helpers.js";

const direction = loadWorld("editorial").direction;
const { ctx } = makeRepo({ "src/lib/format.ts": "export function formatMoney(n: number): string { return String(n); }\n" }, { direction });

/** Rule ids that fire on `text` when it is saved at `path`. */
function fires(path: string, text: string): string[] {
  const file = makeSourceFile(path, text);
  return FILE_RULES.filter((r) => r.langs.includes(file.lang) && !(r.skipTests && /\.test\./.test(path)))
    .filter((r) => r.check(file, ctx()).length > 0)
    .map((r) => r.id);
}

const cases: { rule: string; path: string; bad: string; good: string }[] = [
  { rule: "DS-HEDGE", path: "src/a.ts", bad: "// this should work for now\nexport const a = 1;\n", good: "// Retries are capped because the API rate-limits at 5/s.\nexport const a = 1;\n" },
  { rule: "DS-STUB", path: "src/a.ts", bad: "export function f() { // TODO: implement\n  return 1;\n}\n", good: "export function f() {\n  return 1;\n}\n" },
  { rule: "DS-DEAD-COMMENT", path: "src/a.ts", bad: "// const a = 1;\n// const b = 2;\n// return a + b;\nexport const x = 1;\n", good: "// Explains why x is one.\nexport const x = 1;\n" },
  { rule: "DS-SUPPRESS", path: "src/a.ts", bad: "// @ts-ignore\nexport const a: any = 1;\n", good: "export const a: unknown = 1;\n" },
  { rule: "DS-DEBUG", path: "src/a.ts", bad: "export function f() { console.log('x'); }\n", good: "export function f() { return 1; }\n" },
  { rule: "DS-SWALLOW", path: "src/a.ts", bad: "export function f() { try { g(); } catch (e) { console.log(e); } }\nfunction g() {}\n", good: "export function f() { try { g(); } catch (e) { throw new Error('failed', { cause: e }); } }\nfunction g() {}\n" },
  { rule: "DS-SIZE", path: "src/a.ts", bad: `export function f(a: number, b: number, c: number, d: number, e: number) { return a + b + c + d + e; }\n`, good: "export function f(a: number, b: number) { return a + b; }\n" },
  { rule: "DS-BOOL-SOUP", path: "src/a.ts", bad: "export function f(a: boolean, b: boolean, c: boolean) { return a && b && c; }\n", good: "export function f(mode: 'a' | 'b') { return mode; }\n" },
  { rule: "DS-REINVENT", path: "src/a.ts", bad: "export function deepClone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }\n", good: "export const copy = <T,>(x: T): T => structuredClone(x);\n" },
  { rule: "DS-MOCK-PROD", path: "src/a.ts", bad: "export const mockUsers = [{ name: 'x' }];\n", good: "export const users = [{ name: 'x' }];\n" },
  { rule: "DS-ADAPTER", path: "src/a.ts", bad: "import { Resend } from 'resend';\nexport const r = Resend;\n", good: "export const r = 1;\n" },
  { rule: "DS-TOKEN", path: "src/a.tsx", bad: "export const A = () => <div style={{ color: '#ff0000' }} />;\n", good: "export const A = () => <div style={{ color: 'var(--accent)' }} />;\n" },
  { rule: "DS-ARBITRARY", path: "src/a.tsx", bad: "export const A = () => <div className=\"p-[13px]\" />;\n", good: "export const A = () => <div className=\"p-3\" />;\n" },
  { rule: "DS-FONT", path: "src/a.css", bad: "body { font-family: 'Poppins', sans-serif; }\n", good: `body { font-family: '${allowedFonts(direction)[0]}', serif; }\n` },
  { rule: "DS-GRADIENT-TEXT", path: "src/a.tsx", bad: "export const A = () => <h1 className=\"bg-clip-text text-transparent\">x</h1>;\n", good: "export const A = () => <h1 className=\"font-bold\">x</h1>;\n" },
  { rule: "DS-AI-GRADIENT", path: "src/a.tsx", bad: "export const A = () => <div className=\"bg-gradient-to-r from-purple-500 to-blue-500\" />;\n", good: "export const A = () => <div className=\"bg-accent\" />;\n" },
  { rule: "DS-GLOW", path: "src/a.css", bad: ".x { box-shadow: 0 0 24px rgba(80, 120, 255, .6); }\n", good: ".x { box-shadow: 0 8px 24px rgba(0, 0, 0, .12); }\n" },
  { rule: "DS-EMOJI-ICON", path: "src/a.tsx", bad: "export const A = () => <span>🚀 Fast</span>;\n", good: "export const A = () => <span>© 2026</span>;\n" },
  { rule: "DS-NESTED-CARD", path: "src/a.tsx", bad: "export const A = () => <div className=\"rounded-xl border p-4\"><div className=\"rounded-lg border p-3\">x</div></div>;\n", good: "export const A = () => <div className=\"rounded-xl border p-4\"><div className=\"mt-3\">x</div></div>;\n" },
  { rule: "DS-ALT", path: "src/a.tsx", bad: "export const A = () => <img src=\"/a.png\" />;\n", good: "export const A = () => <img src=\"/a.png\" alt=\"\" />;\n" },
  { rule: "DS-PLACEHOLDER", path: "src/a.tsx", bad: "export const A = () => <p>Lorem ipsum dolor sit amet</p>;\n", good: "export const A = () => <p>Ships in two days.</p>;\n" },
  { rule: "DS-STOCK-COPY", path: "src/a.tsx", bad: "export const A = () => <p>Unlock the power of seamless shipping.</p>;\n", good: "export const A = () => <p>We ship from 14 warehouses.</p>;\n" },
  { rule: "DS-CONTENT", path: "src/a.tsx", bad: "export const A = () => <p>Share the product or shipment details and the best route will be confirmed for you before anything is paid.</p>;\n", good: "export const A = () => <p>Ships in two days.</p>;\n" },
  { rule: "DS-REUSE", path: "src/lib/money.ts", bad: "export function formatPrice(n: number): string { return String(n); }\n", good: "export function parseAmount(s: string): number { return Number(s); }\n" },
];

for (const { rule, path, bad, good } of cases) {
  test(`${rule} fires on the bad example and stays quiet on the good one`, () => {
    assert.ok(fires(path, bad).includes(rule), `${rule} should fire on:\n${bad}`);
    assert.ok(!fires(path, good).includes(rule), `${rule} should not fire on:\n${good}`);
  });
}

test("every file rule has a test case", () => {
  const tested = new Set(cases.map((c) => c.rule));
  const untested = FILE_RULES.map((r) => r.id).filter((id) => !tested.has(id) && id !== "DS-LAYER");
  assert.deepEqual(untested, []);
});

test("DS-TOKEN ignores the token file and meta tags", () => {
  assert.deepEqual(fires("src/style.css", ":root { --c: #ff0000; }\n"), []);
  assert.ok(!fires("index.html", '<meta name="theme-color" content="#176ec1">\n').includes("DS-TOKEN"));
});

test("DS-ARBITRARY leaves calc, var and colours to other rules", () => {
  assert.ok(!fires("src/a.tsx", 'export const A = () => <div className="max-w-[calc(100vw-30px)] w-[var(--x)]" />;\n').includes("DS-ARBITRARY"));
});

test("DS-GLOW allows rings (no blur)", () => {
  assert.ok(!fires("src/a.tsx", 'export const A = () => <i className="shadow-[0_0_0_4px_#fff3]" />;\n').includes("DS-GLOW"));
});

test("a component may be longer than a plain function", () => {
  const body = Array.from({ length: 70 }, (_, i) => `  const v${i} = ${i};`).join("\n");
  assert.ok(fires("src/a.ts", `export function build() {\n${body}\n  return 1;\n}\n`).includes("DS-SIZE"));
  assert.ok(!fires("src/a.tsx", `export function Panel() {\n${body}\n  return <div />;\n}\n`).includes("DS-SIZE"));
});
