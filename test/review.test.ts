import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { loadConfig } from "../src/core/config.js";
import { captureReview } from "../src/review/capture.js";
import { ensureServer } from "../src/review/server.js";
import { makeRepo } from "./helpers.js";

const PAGE = (body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${body}</body></html>`;

function serve(html: string): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    });
    server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server }));
  });
}

const reviewConfig = (url: string) => ({ review: { url, viewports: [{ name: "phone", width: 390, height: 800 }], maxRounds: 2, devCommand: "" } });

test("review measures sideways overflow, broken images and bad contrast, and saves a screenshot", async () => {
  const html = PAGE(`<main><h1 style="color:#bbb;background:#fff">Low contrast heading</h1><div style="width:900px;height:20px;background:red"></div><img src="/missing.png" alt="x" width="40" height="40"></main>`);
  const { url, server } = await serve(html);
  try {
    const { root } = makeRepo({}, { config: reviewConfig(url) });
    const result = await captureReview(root, loadConfig(root), 1);
    const rules = result.findings.map((f) => f.rule);
    assert.ok(rules.includes("DS-OVERFLOW"), `overflow in ${rules}`);
    assert.ok(rules.includes("DS-A11Y"), `a11y in ${rules}`);
    assert.ok(rules.includes("DS-CONSOLE") || rules.includes("DS-IMG-BROKEN"), `missing image in ${rules}`);
    assert.ok(existsSync(result.shots[0].path));
    assert.ok(result.findings.filter((f) => f.rule === "DS-OVERFLOW").every((f) => f.level === "block"));
  } finally {
    server.close();
  }
});

test("a clean page has no findings", async () => {
  const { url, server } = await serve(PAGE(`<main><h1 style="color:#111;background:#fff">Hello</h1><p style="color:#222">Short and fine.</p></main>`));
  try {
    const { root } = makeRepo({}, { config: reviewConfig(url) });
    assert.deepEqual((await captureReview(root, loadConfig(root), 1)).findings, []);
  } finally {
    server.close();
  }
});

test("review.url missing, or unreachable with no devCommand, is an explicit error", async () => {
  const { root } = makeRepo({}, { config: reviewConfig("") });
  await assert.rejects(ensureServer(root, loadConfig(root).review), /review\.url is not set/);
  const { root: other } = makeRepo({}, { config: reviewConfig("http://127.0.0.1:9") });
  await assert.rejects(ensureServer(other, loadConfig(other).review), /not reachable/);
});

test("devCommand is started when the server is down, and stopped afterwards", async () => {
  const { root } = makeRepo({ "server.mjs": `import { createServer } from "node:http"; createServer((q, r) => r.end("ok")).listen(48731, "127.0.0.1");\n` }, {
    config: { review: { url: "http://127.0.0.1:48731", devCommand: "node server.mjs", maxRounds: 2, viewports: [] } },
  });
  const running = await ensureServer(root, loadConfig(root).review);
  assert.equal((await fetch("http://127.0.0.1:48731")).status, 200);
  running.stop();
  await new Promise((r) => setTimeout(r, 400));
  await assert.rejects(fetch("http://127.0.0.1:48731"));
});
