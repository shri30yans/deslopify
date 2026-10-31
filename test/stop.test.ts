import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { recordBaseline } from "../src/commands/init.js";
import { stop } from "../src/commands/stop.js";
import { writeState } from "../src/core/state.js";
import { makeRepo } from "./helpers.js";

const PAGE = (body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><main><h1 style="color:#111;background:#fff">Hello</h1>${body}</main></body></html>`;

const OVERFLOW = `<div class="wide" style="width:900px;height:10px;background:red"></div>`;
const BROKEN = `<img src="/missing.png" alt="x" width="30" height="30">`;

async function serveMutable(initial: string): Promise<{ url: string; set(html: string): void; close(): void }> {
  let html = initial;
  const server = createServer((req, res) => {
    if (req.url === "/missing.png") {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" }).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, set: (h) => (html = h), close: () => server.close() };
}

const payload = (root: string) => ({ session_id: "s", cwd: root, hook_event_name: "Stop" });
const reasonOf = (output: Record<string, unknown> | null): string => String(output?.reason ?? "");

test("stop: problems already on the page do not block, new ones do, and a clean page lets go", async () => {
  const page = await serveMutable(PAGE(OVERFLOW));
  try {
    const { root } = makeRepo({ "src/a.tsx": "export const A = () => <div />;\n" }, { config: { review: { url: page.url, devCommand: "", maxRounds: 2, viewports: [{ name: "phone", width: 390, height: 800 }] } } });
    await recordBaseline(root);
    writeState(root, "s", { touched: ["src/a.tsx"], reviewRounds: 0 });

    const first = await stop(root, payload(root));
    assert.equal(first?.decision, "block");
    assert.match(reasonOf(first), /Visual review, round 1/);
    assert.match(reasonOf(first), /did not alter how the page looks/);
    assert.ok(!reasonOf(first).includes("DS-OVERFLOW"), "the existing overflow is the baseline, not news");

    page.set(PAGE(OVERFLOW + BROKEN));
    const second = await stop(root, payload(root));
    assert.equal(second?.decision, "block");
    assert.match(reasonOf(second), /DS-IMG-BROKEN|DS-CONSOLE/);
    assert.ok(!reasonOf(second).includes("DS-OVERFLOW"));

    page.set(PAGE(OVERFLOW));
    assert.equal(await stop(root, payload(root)), null);
  } finally {
    page.close();
  }
});

test("stop does nothing when no file was touched", async () => {
  const { root } = makeRepo({});
  assert.equal(await stop(root, payload(root)), null);
});

test("stop with a UI change but no render baseline is an explicit error", async () => {
  const page = await serveMutable(PAGE(""));
  try {
    const { root } = makeRepo({ "src/a.tsx": "export const A = () => <div />;\n" }, { config: { review: { url: page.url, devCommand: "", maxRounds: 2, viewports: [{ name: "phone", width: 390, height: 800 }] } } });
    writeState(root, "s", { touched: ["src/a.tsx"], reviewRounds: 0 });
    await assert.rejects(stop(root, payload(root)), /render-baseline\.json not found/);
  } finally {
    page.close();
  }
});

test("stop lets go after maxRounds and tells the user what is still open", async () => {
  const page = await serveMutable(PAGE(""));
  try {
    const { root } = makeRepo({ "src/a.tsx": "export const A = () => <div />;\n" }, { config: { review: { url: page.url, devCommand: "", maxRounds: 1, viewports: [{ name: "phone", width: 390, height: 800 }] } } });
    await recordBaseline(root);
    page.set(PAGE(BROKEN));
    writeState(root, "s", { touched: ["src/a.tsx"], reviewRounds: 0 });
    assert.equal((await stop(root, payload(root)))?.decision, "block");
    const last = await stop(root, payload(root));
    assert.equal(last?.decision, undefined);
    assert.match(String(last?.systemMessage), /stopped after 1 review rounds/);
  } finally {
    page.close();
  }
});
