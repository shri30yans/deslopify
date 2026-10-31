import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Level = "block" | "warn" | "off";

export interface Layer {
  name: string;
  paths: string[];
}

export type LinterName = "typescript" | "eslint" | "ruff";

export interface Ignore {
  rule: string;
  files: string[];
  reason: string;
}

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

export interface Config {
  include: string[];
  exclude: string[];
  doNotEdit: string[];
  /** Files allowed to define raw colours and fonts (design tokens). */
  tokenFiles: string[];
  /** Ordered top → bottom. A file may import from its own layer or any layer below it. */
  layers: Layer[];
  aliases: Record<string, string>;
  adapters: { paths: string[]; vendors: string[] };
  contentPaths: string[];
  testPaths: string[];
  budgets: { fileLines: number; functionLines: number; componentLines: number; params: number; nesting: number };
  /** preferred term → terms to avoid */
  glossary: Record<string, string[]>;
  /** "path#symbol" entries always marked as the one to reuse. */
  canonical: string[];
  allowArbitrary: string[];
  rules: Record<string, Level>;
  /** The only way to silence a rule: a named exception with a reason a reviewer can judge. */
  ignores: Ignore[];
  /** Tools whose findings join ours. Each enabled tool must be installed; there is no silent skip. */
  linters: LinterName[];
  codemap: { tokenBudget: number };
  review: { url: string; devCommand: string; maxRounds: number; viewports: Viewport[] };
}

export const CONFIG_DIR = ".deslopify";
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export const DEFAULT_CONFIG: Config = {
  include: ["**/*.{ts,tsx,js,jsx,mjs,cjs,css,html,py}"],
  exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**", "**/coverage/**", "**/*.min.*", ".deslopify/**"],
  doNotEdit: ["dist/**", "build/**", "**/*.generated.*", "**/*.min.*"],
  tokenFiles: ["**/style.css", "**/globals.css", "**/tokens.*", "**/theme.*", "tailwind.config.*"],
  layers: [],
  aliases: { "@/": "src/", "~/": "src/" },
  adapters: {
    paths: ["**/adapters/**", "api/**", "server/**", "**/*.server.*", "scripts/**"],
    vendors: ["resend", "stripe", "openai", "@anthropic-ai/sdk", "@supabase/supabase-js", "firebase", "firebase-admin", "twilio", "@sendgrid/mail", "nodemailer", "aws-sdk", "@aws-sdk/*"],
  },
  contentPaths: ["**/data/**", "**/content/**", "**/i18n/**", "**/locales/**", "**/*.md", "**/*.mdx"],
  testPaths: ["**/*.test.*", "**/*.spec.*", "**/test/**", "**/tests/**", "**/__tests__/**", "**/fixtures/**", "scripts/**", "audit/**"],
  budgets: { fileLines: 300, functionLines: 50, componentLines: 120, params: 4, nesting: 3 },
  glossary: {},
  canonical: [],
  allowArbitrary: ["^aspect-\\[", "^\\[--"],
  rules: {},
  ignores: [],
  linters: [],
  codemap: { tokenBudget: 1200 },
  review: {
    url: "",
    devCommand: "",
    maxRounds: 2,
    viewports: [
      { name: "wide", width: 1680, height: 1000 },
      { name: "laptop", width: 1280, height: 800 },
      { name: "phone", width: 390, height: 844 },
      { name: "narrow", width: 320, height: 640 },
    ],
  },
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function merge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in out ? merge(out[key], value) : value;
  }
  return out as T;
}

export class NotInitializedError extends Error {
  constructor(root: string) {
    super(`${join(root, CONFIG_FILE)} not found. Run \`deslopify init\` first.`);
  }
}

/** The one place project settings are read. Defaults fill unset keys; a missing file is an error. */
export function loadConfig(root: string): Config {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) throw new NotInitializedError(root);
  const config = merge(DEFAULT_CONFIG, JSON.parse(readFileSync(file, "utf8")));
  for (const ignore of config.ignores) {
    if (!ignore.reason.trim()) throw new Error(`Ignore for ${ignore.rule} in ${CONFIG_FILE} needs a reason.`);
  }
  return config;
}
