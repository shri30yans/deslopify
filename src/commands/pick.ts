import { spawn } from "node:child_process";
import { applyWorld } from "../studio/apply.js";
import type { BoardCopy } from "../studio/render.js";
import { startStudio } from "../studio/server.js";
import { renderShots } from "../studio/shots.js";
import { loadWorld, loadWorlds, rankWorlds, type World } from "../studio/worlds.js";

export interface PickArgs extends BoardCopy {
  /** One or two sentences on the product and audience; chooses which Worlds to show. */
  about: string;
  /** Skip the picker and apply this World directly. */
  world?: string;
  open: boolean;
}

const CHOICE_TIMEOUT_MS = 15 * 60 * 1000;

function openInBrowser(url: string): void {
  const [command, ...args] = process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`No look was chosen within ${ms / 60000} minutes.`)), ms).unref());
}

/** Show the user's copy in three Worlds, wait for a choice, and make it the project's direction. */
export async function pick(root: string, args: PickArgs): Promise<World> {
  const worlds = args.world ? [loadWorld(args.world)] : rankWorlds(args.about, loadWorlds());
  const studio = await startStudio(worlds, args);
  try {
    const shots = await renderShots(studio.origin, worlds);
    let id = args.world;
    if (!id) {
      console.log(`Studio ready: ${studio.origin}\nWaiting for the user to choose a look in the browser...`);
      if (args.open) openInBrowser(studio.origin);
      id = await Promise.race([studio.choose(shots), timeout(CHOICE_TIMEOUT_MS)]);
    }
    const chosen = shots.find((s) => s.world.id === id)!;
    applyWorld(root, chosen.world, chosen.desktop);
    return chosen.world;
  } finally {
    studio.close();
  }
}
