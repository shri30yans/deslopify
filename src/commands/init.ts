import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { onPath } from "../adapters/run.js";
import { CONFIG_DIR, CONFIG_FILE, DEFAULT_CONFIG, type Config, type Layer, type LinterName } from "../core/config.js";
import { listSourceFiles, readSourceFile } from "../core/files.js";
import { requireGitRepo } from "../core/git.js";
import { matchesAny } from "../core/glob.js";
import { loadConfig } from "../core/config.js";
import { saveRenderBaseline } from "../review/baseline.js";
import { captureReview } from "../review/capture.js";
import { writeInstructions } from "./instructions.js";
import { refreshCodemap } from "./project.js";

/** Conventional layers, top to bottom. A layer is kept only when files exist for it. */
const LAYER_CANDIDATES: Layer[] = [
  { name: "app", paths: ["src/App.*", "src/main.*", "src/app/**", "src/pages/**", "src/routes/**"] },
  { name: "features", paths: ["src/features/**"] },
  { name: "sections", paths: ["src/components/sections/**"] },
  { name: "components", paths: ["src/components/*.*"] },
  { name: "ui", paths: ["src/components/ui/**"] },
  { name: "lib", paths: ["src/lib/**", "src/hooks/**", "src/utils/**"] },
  { name: "data", paths: ["src/data/**"] },
];

const hasAny = (root: string, files: readonly string[], dir: string): boolean => files.some((f) => f.startsWith(`${dir}/`)) || existsSync(join(root, dir));

function detectLayers(files: readonly string[]): Layer[] {
  return LAYER_CANDIDATES.filter((l) => files.some((f) => matchesAny(f, l.paths)));
}

function detectAliases(root: string): Record<string, string> {
  const tsconfig = join(root, "tsconfig.json");
  if (!existsSync(tsconfig)) return {};
  const { config } = ts.readConfigFile(tsconfig, ts.sys.readFile);
  const paths = (config?.compilerOptions?.paths ?? {}) as Record<string, string[]>;
  return Object.fromEntries(
    Object.entries(paths)
      .filter(([key, targets]) => key.endsWith("/*") && targets[0]?.endsWith("/*"))
      .map(([key, targets]) => [key.slice(0, -1), `${targets[0].slice(0, -1).replace(/^\.\//, "")}`]),
  );
}

function detectLinters(root: string, files: readonly string[]): LinterName[] {
  const linters: LinterName[] = [];
  if (existsSync(join(root, "tsconfig.json"))) linters.push("typescript");
  const hasEslintConfig = ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs"].some((f) => existsSync(join(root, f)));
  if (hasEslintConfig && existsSync(join(root, "node_modules/.bin/eslint"))) linters.push("eslint");
  if (files.some((f) => f.endsWith(".py")) && onPath("ruff")) linters.push("ruff");
  return linters;
}

/** Files that announce themselves as generated: editing them is always a mistake. */
function detectGenerated(root: string, files: readonly string[]): string[] {
  return files.filter((f) => readSourceFile(root, f).lines.slice(0, 6).some((l) => /@generated|generated (by|from|file)|do not (edit|modify)|auto-?generated/i.test(l)));
}

function detectDevServer(root: string): { url: string; devCommand: string } {
  const pkgFile = join(root, "package.json");
  if (!existsSync(pkgFile)) return { url: "", devCommand: "" };
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8")) as { scripts?: Record<string, string>; dependencies?: object; devDependencies?: object };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
  const dev = pkg.scripts?.dev;
  if (!dev) return { url: "", devCommand: "" };
  const url = "vite" in deps ? "http://localhost:5173" : "next" in deps ? "http://localhost:3000" : "astro" in deps ? "http://localhost:4321" : "";
  return { url, devCommand: "npm run dev" };
}

function ignoreRuntimeState(root: string): void {
  const file = join(root, ".gitignore");
  const wanted = [`${CONFIG_DIR}/state/`, `${CONFIG_DIR}/review/`];
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const missing = wanted.filter((w) => !current.split("\n").includes(w));
  if (missing.length) appendFileSync(file, `${current && !current.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`);
}

/** Measure the page as it is now and record its problems, so only regressions block later. */
export async function recordBaseline(root: string): Promise<string> {
  const review = await captureReview(root, loadConfig(root), 0);
  const count = saveRenderBaseline(root, review.findings);
  return `Recorded ${count} existing render problem${count === 1 ? "" : "s"} as the baseline (${".deslopify/render-baseline.json"}). Commit it.`;
}

export async function init(root: string): Promise<string[]> {
  requireGitRepo(root);
  if (existsSync(join(root, CONFIG_FILE))) throw new Error(`${CONFIG_FILE} already exists. Use \`deslopify sync\` to refresh the codemap and instructions.`);

  const files = listSourceFiles(root, DEFAULT_CONFIG);
  const generated = detectGenerated(root, files);
  const config: Partial<Config> = {
    aliases: { ...DEFAULT_CONFIG.aliases, ...detectAliases(root) },
    layers: detectLayers(files),
    linters: detectLinters(root, files),
    doNotEdit: [...DEFAULT_CONFIG.doNotEdit, ...generated],
    tokenFiles: [...DEFAULT_CONFIG.tokenFiles, `${CONFIG_DIR}/tokens.css`],
    review: { ...DEFAULT_CONFIG.review, ...detectDevServer(root) },
  };
  mkdirSync(join(root, CONFIG_DIR), { recursive: true });
  writeFileSync(join(root, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
  ignoreRuntimeState(root);
  writeInstructions(root);
  const index = refreshCodemap(root);

  const notes = [
    `Created ${CONFIG_FILE}, AGENTS.md rules block and ${CONFIG_DIR}/codemap.md (${index.files.length} files, ${index.symbols.length} exports).`,
    `Layers: ${config.layers!.map((l) => l.name).join(" → ") || "none detected (set \"layers\" in config to enforce import direction)"}.`,
    `Linters: ${config.linters!.join(", ") || "none"}.`,
  ];
  if (generated.length) notes.push(`Marked generated, do-not-edit: ${generated.join(", ")}.`);
  if (config.review?.url) notes.push(await recordBaseline(root));
  else if (hasAny(root, files, "src")) notes.push('Set review.url (and devCommand) in the config, then run `deslopify baseline`, so the stop hook can render the page.');
  return notes;
}
