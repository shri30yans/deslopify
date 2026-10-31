import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { CONFIG_DIR, type Config, type Viewport } from "../core/config.js";
import type { Finding } from "../core/findings.js";
import { accessibility, brokenImage, consoleError, overflow, type ToolRule } from "../rules/tools.js";
import { levelOf } from "../core/engine.js";
import { ensureServer } from "./server.js";

const MAX_SHOT_HEIGHT = 5000;
const SETTLE_MS = 1200;

export interface Shot {
  viewport: string;
  path: string;
}

export interface ReviewResult {
  shots: Shot[];
  findings: Finding[];
}

interface PageProblems {
  overflowBy: number;
  offenders: string[];
  brokenImages: string[];
}

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[] }[];
}

const axeSource = (): string => readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

/** Runs in the page: how far content spills sideways, who spills, and which images failed. */
const measure = (): PageProblems => {
  const width = document.documentElement.clientWidth;
  const offenders = [...document.body.querySelectorAll("*")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.right > width + 1 && style.position !== "fixed" && style.visibility !== "hidden";
    })
    .slice(0, 3)
    .map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/).slice(0, 2).join(".")}` : ""}`);
  const brokenImages = [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src);
  return { overflowBy: Math.max(0, document.documentElement.scrollWidth - width), offenders, brokenImages };
};

function finding(config: Config, rule: ToolRule, viewport: Viewport, key: string, message: string, fix: string): Finding[] {
  const level = levelOf(rule, config);
  if (level === "off") return [];
  return [{ rule: rule.id, level, file: `render@${viewport.name}`, line: 1, message, fix, why: rule.why, key }];
}

async function inspect(page: Page, config: Config, viewport: Viewport, consoleErrors: string[]): Promise<Finding[]> {
  const out: Finding[] = [];
  const problems = await page.evaluate(measure);
  if (problems.overflowBy > 1) {
    out.push(...finding(config, overflow, viewport, problems.offenders.join(","), `Page scrolls sideways by ${problems.overflowBy}px at ${viewport.width}px wide (${problems.offenders.join(", ") || "unknown element"}).`, "Constrain the widest element (max-width, min-w-0, wrapping) so nothing exceeds the viewport."));
  }
  for (const src of problems.brokenImages) out.push(...finding(config, brokenImage, viewport, src, `Image failed to load: ${src}`, "Fix the path, add the file, or remove the element."));
  for (const message of consoleErrors) out.push(...finding(config, consoleError, viewport, message, message, "Fix the error shown; it is a runtime bug."));

  await page.evaluate(axeSource());
  const violations = await page.evaluate(
    async () => (await (window as unknown as { axe: { run(c: Document, o: object): Promise<{ violations: AxeViolation[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations,
  );
  for (const v of violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
    out.push(...finding(config, accessibility, viewport, `${v.id}:${String(v.nodes[0]?.target[0] ?? "")}`, `${v.help} (${v.id}, ${v.nodes.length} element${v.nodes.length === 1 ? "" : "s"}; first: ${String(v.nodes[0]?.target[0] ?? "")}).`, "Fix the contrast, name or label as axe describes."));
  }
  return out;
}

/** Render the page at each configured viewport, measure it, and save a screenshot of each. */
export async function captureReview(root: string, config: Config, round: number): Promise<ReviewResult> {
  const server = await ensureServer(root, config.review);
  const dir = join(root, CONFIG_DIR, "review", `round-${round}`);
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const shots: Shot[] = [];
    const findings: Finding[] = [];
    for (const viewport of config.review.viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
      page.on("pageerror", (e) => consoleErrors.push(e.message));
      await page.goto(config.review.url, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(SETTLE_MS);
      findings.push(...(await inspect(page, config, viewport, consoleErrors)));
      const path = join(dir, `${viewport.name}.png`);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({ path, clip: { x: 0, y: 0, width: viewport.width, height: Math.min(height, MAX_SHOT_HEIGHT) } });
      shots.push({ viewport: viewport.name, path });
      await context.close();
    }
    return { shots, findings };
  } finally {
    await browser.close();
    server.stop();
  }
}
