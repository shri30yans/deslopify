import { spawn, type ChildProcess } from "node:child_process";
import type { Config } from "../core/config.js";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function reachable(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

export interface RunningServer {
  stop(): void;
}

/**
 * Make sure the page under review is being served. A server that is already up is used as is;
 * otherwise `review.devCommand` is started and waited for. Neither is an error with instructions.
 */
export async function ensureServer(root: string, review: Config["review"]): Promise<RunningServer> {
  if (!review.url) throw new Error('review.url is not set in .deslopify/config.json. Set it to the dev server address, e.g. "http://localhost:5173".');
  if (await reachable(review.url)) return { stop: () => undefined };
  if (!review.devCommand) throw new Error(`${review.url} is not reachable and review.devCommand is not set in .deslopify/config.json.`);

  const child: ChildProcess = spawn(review.devCommand, { cwd: root, shell: true, detached: true, stdio: "ignore" });
  const stop = (): void => {
    if (child.pid) process.kill(-child.pid, "SIGTERM");
  };
  for (let waited = 0; waited < 45_000; waited += 500) {
    if (await reachable(review.url)) return { stop };
    await sleep(500);
  }
  stop();
  throw new Error(`Started \`${review.devCommand}\` but ${review.url} did not respond within 45s.`);
}
