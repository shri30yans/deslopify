import assert from "node:assert/strict";
import { test } from "node:test";
import { auditFiles, checkWrittenFile, openTools } from "../src/core/pipeline.js";
import { makeRepo, write } from "./helpers.js";

const TSCONFIG = JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, noEmit: true, types: [] }, include: ["src"] });

const FILES = {
  "tsconfig.json": TSCONFIG,
  "src/greet.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
  "src/a.ts": "import { greet } from './greet';\nexport const a = greet('a');\n",
  "src/b.ts": "import { greet } from './greet';\nexport const b = greet('b');\n",
};

test("a type error in the edited file is reported as blocking DS-TYPE", () => {
  const { root, ctx } = makeRepo(FILES, { config: { linters: ["typescript"] } });
  write(root, "src/a.ts", "import { greet } from './greet';\nexport const a: number = greet('a');\n");
  const { findings } = checkWrittenFile(root, ctx(), openTools(root, ctx()), "src/a.ts");
  const type = findings.find((f) => f.rule === "DS-TYPE");
  assert.ok(type, "expected DS-TYPE");
  assert.equal(type.level, "block");
  assert.equal(type.line, 2);
  assert.match(type.message, /TS2322/);
});

test("changing an exported signature names its callers and reports their new type errors", () => {
  const { root, ctx } = makeRepo(FILES, { config: { linters: ["typescript"] } });
  write(root, "src/greet.ts", "export function greet(name: string, excited: boolean): string {\n  return `hi ${name}${excited ? '!' : ''}`;\n}\n");
  const { findings } = checkWrittenFile(root, ctx(), openTools(root, ctx()), "src/greet.ts");
  const refs = findings.find((f) => f.rule === "DS-REFS");
  assert.ok(refs, "expected DS-REFS");
  assert.match(refs.message, /src\/a\.ts/);
  assert.match(refs.message, /src\/b\.ts/);
  const broken = findings.filter((f) => f.rule === "DS-TYPE").map((f) => f.file).sort();
  assert.deepEqual(broken, ["src/a.ts", "src/b.ts"]);
});

test("an edit that keeps the signature does not ask about callers", () => {
  const { root, ctx } = makeRepo(FILES, { config: { linters: ["typescript"] } });
  write(root, "src/greet.ts", "export function greet(name: string): string {\n  return `hello ${name}`;\n}\n");
  const { findings } = checkWrittenFile(root, ctx(), openTools(root, ctx()), "src/greet.ts");
  assert.deepEqual(findings, []);
});

test("enabling typescript without a tsconfig is an error, not a silent skip", () => {
  const { root, ctx } = makeRepo({ "src/a.ts": "export const a = 1;\n" }, { config: { linters: ["typescript"] } });
  assert.throws(() => openTools(root, ctx()), /no tsconfig\.json/);
});

test("enabling eslint when it is not installed is an error", () => {
  const { root, ctx } = makeRepo({ "src/a.ts": "export const a = 1;\n" }, { config: { linters: ["eslint"] } });
  assert.throws(() => auditFiles(root, ctx(), openTools(root, ctx()), ["src/a.ts"], "all", { project: false }), /eslint is enabled/);
});
