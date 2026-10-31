import assert from "node:assert/strict";
import { test } from "node:test";
import { loadIndex } from "../src/codemap/build.js";
import { pageRank } from "../src/codemap/rank.js";
import { renderCodemap } from "../src/codemap/render.js";
import { resolveImport } from "../src/codemap/resolve.js";
import { findSimilar, nameWords } from "../src/codemap/similarity.js";
import { renderInstructions } from "../src/commands/instructions.js";
import { globToRegExp } from "../src/core/glob.js";
import { ALL_RULES } from "../src/rules/registry.js";
import { makeRepo } from "./helpers.js";

test("glob: ** crosses folders, * does not, braces alternate", () => {
  assert.ok(globToRegExp("src/**/*.ts").test("src/a/b/c.ts"));
  assert.ok(globToRegExp("src/**/*.ts").test("src/c.ts"));
  assert.ok(!globToRegExp("src/*.ts").test("src/a/c.ts"));
  assert.ok(globToRegExp("**/*.{ts,tsx}").test("a/b.tsx"));
  assert.ok(globToRegExp("src/App.*").test("src/App.tsx"));
});

test("resolveImport handles relative, NodeNext .js, index files and aliases", () => {
  const known = new Set(["src/a.ts", "src/lib/index.ts", "src/b.tsx"]);
  assert.equal(resolveImport("src/x.ts", "./a", known, {}), "src/a.ts");
  assert.equal(resolveImport("src/x.ts", "./a.js", known, {}), "src/a.ts");
  assert.equal(resolveImport("src/x.ts", "./lib", known, {}), "src/lib/index.ts");
  assert.equal(resolveImport("src/x.ts", "@/b", known, { "@/": "src/" }), "src/b.tsx");
  assert.equal(resolveImport("src/x.ts", "react", known, {}), null);
});

test("pageRank puts the most imported file first and sums to one", () => {
  const edges = new Map([["app", ["ui", "lib"]], ["ui", ["lib"]], ["lib", []]]);
  const rank = pageRank(["app", "ui", "lib"], edges);
  assert.ok(rank.get("lib")! > rank.get("ui")! && rank.get("ui")! > rank.get("app")!);
  assert.ok(Math.abs([...rank.values()].reduce((a, b) => a + b, 0) - 1) < 1e-6);
});

test("pageRank bias lifts files relevant to the task", () => {
  const edges = new Map([["a", ["c"]], ["b", ["c"]], ["c", []]]);
  const plain = pageRank(["a", "b", "c"], edges);
  const biased = pageRank(["a", "b", "c"], edges, new Map([["a", 1]]));
  assert.ok(biased.get("a")! > plain.get("a")!);
});

test("name matching understands synonyms and casing", () => {
  assert.deepEqual([...nameWords("formatPriceUSD")].sort(), ["format", "money", "usd"]);
  const index = [{ name: "formatMoney", kind: "function" as const, file: "a.ts", line: 1, signature: "()" }];
  const hit = findSimilar({ name: "renderPrice", kind: "function", file: "b.ts", line: 1, signature: "()" }, index);
  assert.equal(hit[0]?.existing.name, "formatMoney");
  assert.deepEqual(findSimilar({ name: "parseDate", kind: "function", file: "b.ts", line: 1, signature: "()" }, index), []);
});

test("codemap marks widely used exports and stays within its token budget", () => {
  const files: Record<string, string> = { "src/cn.ts": "export const cn = (...c: string[]) => c.join(' ');\n" };
  for (let i = 0; i < 40; i++) files[`src/c${i}.tsx`] = `import { cn } from './cn';\nexport function Comp${i}() { return <div className={cn('a')} />; }\n`;
  const { root, ctx } = makeRepo(files);
  const index = loadIndex(root);
  assert.equal(index.symbols.find((s) => s.name === "cn")?.canonical, true);
  const map = renderCodemap(index, ctx().config);
  assert.match(map, /`cn` ★/);
  assert.ok(map.length / 4 <= ctx().config.codemap.tokenBudget + 40, `map is ${map.length / 4} tokens`);
});

test("the generated instructions list every rule exactly once and stay short", () => {
  const text = renderInstructions();
  for (const rule of ALL_RULES) assert.equal(text.split(`[${rule.id}]`).length - 1, 1, `${rule.id} should appear once`);
  assert.ok(text.split("\n").length <= 60, `instructions are ${text.split("\n").length} lines`);
  assert.ok(ALL_RULES.every((r) => r.instruction.length <= 140), "every rule is one sentence-sized instruction");
});

test("rule ids are unique and every rule explains why", () => {
  const ids = ALL_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ALL_RULES.every((r) => r.why.length > 20));
});
