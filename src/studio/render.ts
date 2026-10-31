import { allowedFonts, type Direction } from "../core/direction.js";
import { fontFaceCss } from "./fonts.js";
import type { World } from "./worlds.js";

export interface BoardCopy {
  brand: string;
  headline: string;
  sub: string;
  cta: string;
  nav: string[];
}

const RADIUS: Record<Direction["radius"], string> = { none: "0", sm: "4px", md: "10px", lg: "20px", pill: "999px" };

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fontStack = (family: string, kind: "serif" | "sans" | "mono"): string => `"${family}", ${kind === "mono" ? "ui-monospace, monospace" : kind === "serif" ? "Georgia, serif" : "system-ui, sans-serif"}`;

/** The design tokens as CSS variables. This is the single place direction.json becomes CSS. */
export function tokensCss(d: Direction): string {
  const p = d.palette;
  const display = d.fonts.display;
  const serifDisplay = /serif|fraunces/i.test(display);
  return `:root{--bg:${p.bg};--surface:${p.surface};--ink:${p.ink};--muted:${p.muted};--accent:${p.accent};--accent-ink:${p.accentInk};--line:${p.line};--radius:${RADIUS[d.radius]};--font-display:${fontStack(display, serifDisplay ? "serif" : "sans")};--font-text:${fontStack(d.fonts.text, "sans")};--font-mono:${fontStack(d.fonts.mono ?? "IBM Plex Mono", "mono")};}`;
}

const headlineHtml = (headline: string): string =>
  headline
    .split(/\\n|\n/)
    .map((line) => `<span class="line">${escapeHtml(line.trim())}</span>`)
    .join("");

/** Placeholders every board must use, so the user's own copy and the direction's tokens always show. */
const REQUIRED = ["fonts", "tokens", "brand", "headline", "sub", "cta"];

/** Strict template fill: a placeholder without a value, or a required one left unused, is a bug in the template. */
function fill(template: string, values: Record<string, string>): string {
  const used = new Set<string>();
  const out = template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (!(key in values)) throw new Error(`Template uses {{${key}}} which has no value.`);
    used.add(key);
    return values[key];
  });
  const missing = REQUIRED.filter((k) => !used.has(k));
  if (missing.length) throw new Error(`Template never uses: ${missing.map((k) => `{{${k}}}`).join(", ")}.`);
  return out;
}

export function renderBoard(world: World, copy: BoardCopy): string {
  const d = world.direction;
  return fill(world.heroTemplate, {
    fonts: fontFaceCss(allowedFonts(d)),
    tokens: tokensCss(d),
    assets: `/worlds/${world.id}/assets`,
    brand: escapeHtml(copy.brand),
    headline: headlineHtml(copy.headline),
    sub: escapeHtml(copy.sub),
    cta: escapeHtml(copy.cta),
    nav: copy.nav.map((n) => `<a href="#">${escapeHtml(n)}</a>`).join(""),
  });
}
