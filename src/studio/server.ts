import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { fontFilePath } from "./fonts.js";
import { renderStudio } from "./page.js";
import { renderBoard, type BoardCopy } from "./render.js";
import type { BoardShots } from "./shots.js";
import type { World } from "./worlds.js";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".css": "text/css" };

export interface Studio {
  origin: string;
  /** Show the picker with these rendered boards; resolves with the chosen World id. */
  choose(shots: readonly BoardShots[]): Promise<string>;
  close(): void;
}

function send(res: ServerResponse, status: number, type: string, body: Buffer | string): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function sendFile(res: ServerResponse, file: string): void {
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, "text/plain", "Not found");
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(file).pipe(res);
}

export function startStudio(worlds: readonly World[], copy: BoardCopy): Promise<Studio> {
  const byId = new Map(worlds.map((w) => [w.id, w]));
  let shots: readonly BoardShots[] = [];
  let resolveChoice: ((id: string) => void) | null = null;

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const [, section, id, ...rest] = url.pathname.split("/");
    if (req.method === "POST" && section === "choose" && id) {
      if (!byId.has(id) || !resolveChoice) return send(res, 400, "text/plain", `Cannot choose "${id}" now.`);
      resolveChoice(id);
      resolveChoice = null;
      return send(res, 200, "text/plain", "ok");
    }
    if (section === "board" && id && byId.has(id)) return send(res, 200, TYPES[".html"], renderBoard(byId.get(id)!, copy));
    if (section === "fonts" && id) {
      const file = fontFilePath(id);
      return file ? sendFile(res, file) : send(res, 404, "text/plain", "Unknown font");
    }
    if (section === "worlds" && id && rest[0] === "assets" && byId.has(id)) {
      const asset = normalize(rest.slice(1).join("/"));
      return asset.startsWith("..") ? send(res, 400, "text/plain", "Bad path") : sendFile(res, join(byId.get(id)!.dir, "assets", asset));
    }
    if (section === "shots" && id && rest[0]) {
      const shot = shots.find((s) => s.world.id === id);
      return shot ? send(res, 200, TYPES[".png"], rest[0] === "phone.png" ? shot.phone : shot.desktop) : send(res, 404, "text/plain", "No shot");
    }
    if (url.pathname === "/") return send(res, 200, TYPES[".html"], renderStudio(copy.brand, shots.map((s) => s.world)));
    return send(res, 404, "text/plain", "Not found");
  };

  const server: Server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch (error) {
      send(res, 500, "text/plain", error instanceof Error ? error.message : String(error));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve({
        origin,
        choose: (rendered) =>
          new Promise<string>((done) => {
            shots = rendered;
            resolveChoice = done;
          }),
        close: () => server.close(),
      });
    });
  });
}
