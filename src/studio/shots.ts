import { chromium } from "playwright-core";
import type { World } from "./worlds.js";

export interface BoardShots {
  world: World;
  desktop: Buffer;
  phone: Buffer;
}

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const SETTLE_MS = 600;

/** Screenshot each World's board from the studio server, at desktop and phone size. */
export async function renderShots(origin: string, worlds: readonly World[]): Promise<BoardShots[]> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const out: BoardShots[] = [];
    for (const world of worlds) {
      const shoot = async (size: { width: number; height: number }, scale: number): Promise<Buffer> => {
        const context = await browser.newContext({ viewport: size, deviceScaleFactor: scale, reducedMotion: "reduce" });
        const page = await context.newPage();
        const response = await page.goto(`${origin}/board/${world.id}`, { waitUntil: "networkidle" });
        if (!response?.ok()) throw new Error(`Board for "${world.id}" failed to render: ${await response?.text()}`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(SETTLE_MS);
        const buffer = await page.screenshot({ type: "png" });
        await context.close();
        return buffer;
      };
      out.push({ world, desktop: await shoot(DESKTOP, 1), phone: await shoot(PHONE, 2) });
    }
    return out;
  } finally {
    await browser.close();
  }
}
