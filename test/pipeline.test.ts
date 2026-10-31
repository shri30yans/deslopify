import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/core/config.js";
import { checkPath, loadContext } from "../src/core/engine.js";
import { auditFiles, checkWrittenFile, openTools } from "../src/core/pipeline.js";
import { scoreFindings } from "../src/core/score.js";
import { addedLines, guard } from "../src/commands/hooks.js";
import { makeRepo, write } from "./helpers.js";

const BASE = {
  "src/lib/format.ts": "export function formatMoney(n: number): string {\n  return String(n);\n}\n",
  "src/ui/Button.tsx": "export function Button() {\n  return <button>ok</button>;\n}\n",
  "src/features/Page.tsx": "import { Button } from '../ui/Button';\nexport function Page() {\n  return <Button />;\n}\n",
};

const layered = {
  layers: [
    { name: "features", paths: ["src/features/**"] },
    { name: "ui", paths: ["src/ui/**"] },
    { name: "lib", paths: ["src/lib/**"] },
  ],
  linters: [] as never[],
};

test("only lines changed since HEAD are reported (the baseline)", () => {
  const { root, ctx } = makeRepo({ ...BASE, "src/old.ts": "export const a: any = 1;\n" }, { config: layered });
  write(root, "src/old.ts", "export const a: any = 1;\nexport const b = 2;\n");
  const findings = checkWrittenFile(root, ctx(), openTools(root, ctx()), "src/old.ts").findings;
  assert.deepEqual(findings, [], "the old `any` is not new");
  write(root, "src/old.ts", "export const a: any = 1;\nexport const b: any = 2;\n");
  const next = checkWrittenFile(root, ctx(), openTools(root, ctx()), "src/old.ts").findings;
  assert.deepEqual(next.map((f) => [f.rule, f.line]), [["DS-SUPPRESS", 2]]);
});

test("a lower layer importing a higher layer is blocked", () => {
  const { root, ctx } = makeRepo(BASE, { config: layered });
  write(root, "src/lib/format.ts", "import { Page } from '../features/Page';\nexport const x = Page;\n");
  const findings = auditFiles(root, ctx(), openTools(root, ctx()), ["src/lib/format.ts"], "git", { project: false });
  const layer = findings.find((f) => f.rule === "DS-LAYER");
  assert.ok(layer, "expected DS-LAYER");
  assert.equal(layer.level, "block");
});

test("importing downward is fine", () => {
  const { root, ctx } = makeRepo(BASE, { config: layered });
  const findings = auditFiles(root, ctx(), openTools(root, ctx()), ["src/features/Page.tsx"], "all", { project: false });
  assert.deepEqual(findings.filter((f) => f.rule === "DS-LAYER"), []);
});

test("an ignore silences exactly its rule and files, and needs a reason", () => {
  const ignore = { rule: "DS-SUPPRESS", files: ["src/legacy/**"], reason: "vendored code we do not own" };
  const { root, ctx } = makeRepo({ ...BASE, "src/legacy/a.ts": "export const a: any = 1;\n", "src/b.ts": "export const b: any = 1;\n" }, { config: { ignores: [ignore] } });
  const findings = auditFiles(root, ctx(), openTools(root, ctx()), ["src/legacy/a.ts", "src/b.ts"], "all", { project: false });
  assert.deepEqual(findings.map((f) => f.file), ["src/b.ts"]);

  assert.throws(() => makeRepo({}, { config: { ignores: [{ ...ignore, reason: " " }] } }), /needs a reason/);
});

test("an unknown rule in config is an error, not a silent no-op", () => {
  const { root } = makeRepo({}, { config: { rules: { "DS-NOPE": "off" } } });
  assert.throws(() => loadContext(root), /Unknown rule "DS-NOPE"/);
});

test("a rule can be turned off or made blocking in config", () => {
  const { root, ctx } = makeRepo({ "src/a.ts": "export const a: any = 1;\n" }, { config: { rules: { "DS-SUPPRESS": "block" } } });
  const [f] = auditFiles(root, ctx(), openTools(root, ctx()), ["src/a.ts"], "all", { project: false });
  assert.equal(f.level, "block");
  const off = makeRepo({ "src/a.ts": "export const a: any = 1;\n" }, { config: { rules: { "DS-SUPPRESS": "off" } } });
  assert.deepEqual(auditFiles(off.root, off.ctx(), openTools(off.root, off.ctx()), ["src/a.ts"], "all", { project: false }), []);
});

test("duplicate blocks across files are found as a project rule", () => {
  const block = Array.from({ length: 10 }, (_, i) => `  const value${i} = compute(${i}) + offset(${i});`).join("\n");
  const files = { "src/a.ts": `export function one() {\n${block}\n}\n`, "src/b.ts": `export function two() {\n${block}\n}\n` };
  const { root, ctx } = makeRepo(files);
  const findings = auditFiles(root, ctx(), openTools(root, ctx()), ["src/a.ts", "src/b.ts"], "all", { project: true });
  assert.ok(findings.some((f) => f.rule === "DS-DUPLICATE" && f.file === "src/a.ts"));
  assert.ok(findings.some((f) => f.rule === "DS-DUPLICATE" && f.file === "src/b.ts"));
});

test("generated paths are rejected by the path rule", () => {
  const { root } = makeRepo({}, { config: { doNotEdit: ["src/data/generated.js"] } });
  const [f] = checkPath(loadConfig(root), "src/data/generated.js");
  assert.equal(f.rule, "DS-GENERATED");
  assert.deepEqual(checkPath(loadConfig(root), "src/index.ts"), []);
});

test("score is 100 when clean and falls with findings", () => {
  const { root, ctx } = makeRepo(BASE);
  const clean = scoreFindings([], ctx().index);
  assert.equal(clean.value, 100);
  const findings = auditFiles(root, ctx(), openTools(root, ctx()), ["src/lib/format.ts"], "all", { project: false });
  assert.equal(findings.length, 0);
  const worse = scoreFindings(Array.from({ length: 20 }, () => ({ rule: "DS-DEBUG", level: "warn" as const, file: "x", line: 1, message: "", fix: "", why: "" })), ctx().index);
  assert.ok(worse.value < 100 && worse.value > 0);
});

test("addedLines reports lines that are not in the previous text", () => {
  assert.deepEqual([...(addedLines("a\nb\nc", "a\nX\nb\nc\nY") as Set<number>)], [2, 5]);
});

test("guard denies a duplicate function before it is written, and allows unrelated code", () => {
  const { root } = makeRepo(BASE);
  const payload = (content: string, file = "src/lib/money.ts") => ({
    session_id: "s",
    cwd: root,
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: `${root}/${file}`, content },
  });
  const denied = guard(root, payload("export function formatPrice(n: number): string {\n  return String(n);\n}\n"));
  assert.ok(denied);
  const reason = JSON.stringify(denied);
  assert.match(reason, /deny/);
  assert.match(reason, /DS-REUSE/);
  assert.match(reason, /formatMoney/);
  assert.equal(guard(root, payload("export function parseAmount(s: string): number {\n  return Number(s);\n}\n")), null);
});

test("guard blocks writes to generated paths and ignores files outside the repo", () => {
  const { root } = makeRepo({}, { config: { doNotEdit: ["dist/**"] } });
  const write_ = (file_path: string) => ({ session_id: "s", cwd: root, hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path, content: "x" } });
  assert.match(JSON.stringify(guard(root, write_(`${root}/dist/app.js`))), /DS-GENERATED/);
  assert.equal(guard(root, write_("/etc/hosts")), null);
});
