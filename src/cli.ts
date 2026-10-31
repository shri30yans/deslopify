import { check, score } from "./commands/audit.js";
import { guard, postEdit, sessionStart } from "./commands/hooks.js";
import { readPayload, type HookOutput, type HookPayload } from "./commands/hookIo.js";
import { init, recordBaseline } from "./commands/init.js";
import { writeInstructions } from "./commands/instructions.js";
import { pick } from "./commands/pick.js";
import { findRoot, refreshCodemap, requireRoot } from "./commands/project.js";
import { stop } from "./commands/stop.js";
import { loadConfig } from "./core/config.js";
import { formatReport } from "./core/findings.js";
import { captureReview } from "./review/capture.js";
import { ALL_RULES } from "./rules/registry.js";

const USAGE = `deslopify: a quality layer for AI coding agents

  deslopify init                 set up this repo (config, rules block in AGENTS.md, codemap)
  deslopify sync                 refresh the codemap and the AGENTS.md rules block
  deslopify check [files...]     check changed files (or the named files)
  deslopify score                SlopScore for the whole repo
  deslopify review               render the page at every viewport and measure it
  deslopify baseline             record the page's existing render problems; only new ones block
  deslopify rules                list every rule
  deslopify pick --brand B --headline H --sub S --cta C --about A [--nav "X,Y"] [--world ID] [--no-open]
                                 show the product's copy in three looks; the choice becomes direction.json
  deslopify hook <event>         Claude Code hook entry (session-start | guard | post-edit | stop)
`;

interface Flags {
  positional: string[];
  values: Map<string, string>;
  switches: Set<string>;
}

const VALUE_FLAGS = new Set(["brand", "headline", "sub", "cta", "about", "nav", "world"]);

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { positional: [], values: new Map(), switches: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) flags.positional.push(arg);
    else if (VALUE_FLAGS.has(arg.slice(2))) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value.`);
      flags.values.set(arg.slice(2), value);
    } else flags.switches.add(arg.slice(2));
  }
  return flags;
}

function required(flags: Flags, name: string): string {
  const value = flags.values.get(name);
  if (!value) throw new Error(`--${name} is required.\n\n${USAGE}`);
  return value;
}

type HookHandler = (root: string, payload: HookPayload) => HookOutput | null | Promise<HookOutput | null>;

const HOOKS: Record<string, HookHandler> = {
  "session-start": (root) => sessionStart(root),
  guard,
  "post-edit": postEdit,
  stop,
};

async function runHook(event: string): Promise<void> {
  const handler = HOOKS[event];
  if (!handler) throw new Error(`Unknown hook event "${event}". Known: ${Object.keys(HOOKS).join(", ")}.`);
  const payload = await readPayload();
  const root = findRoot(payload.cwd);
  if (!root) return;
  const output = await handler(root, payload);
  if (output) process.stdout.write(JSON.stringify(output));
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const cwd = process.cwd();
  switch (command) {
    case "init":
      console.log((await init(cwd)).join("\n"));
      return 0;
    case "sync": {
      const root = requireRoot(cwd);
      writeInstructions(root);
      const index = refreshCodemap(root);
      console.log(`Synced: ${index.files.length} files, ${index.symbols.length} exports.`);
      return 0;
    }
    case "check":
    case "score": {
      const root = requireRoot(cwd);
      const result = command === "check" ? check(root, flags.positional) : score(root);
      console.log(result.output);
      return result.failed ? 1 : 0;
    }
    case "review": {
      const root = requireRoot(cwd);
      const result = await captureReview(root, loadConfig(root), 0);
      console.log([...result.shots.map((s) => `${s.viewport}: ${s.path}`), "", result.findings.length ? formatReport(result.findings, 40) : "No measured problems."].join("\n"));
      return result.findings.some((f) => f.level === "block") ? 1 : 0;
    }
    case "baseline":
      console.log(await recordBaseline(requireRoot(cwd)));
      return 0;
    case "rules":
      console.log(ALL_RULES.map((r) => `${r.id.padEnd(16)} ${r.defaultLevel.padEnd(6)} ${r.instruction}`).join("\n"));
      return 0;
    case "pick": {
      const root = requireRoot(cwd);
      const world = await pick(root, {
        brand: required(flags, "brand"),
        headline: required(flags, "headline"),
        sub: required(flags, "sub"),
        cta: required(flags, "cta"),
        about: required(flags, "about"),
        nav: (flags.values.get("nav") ?? "").split(",").map((n) => n.trim()).filter(Boolean),
        world: flags.values.get("world"),
        open: !flags.switches.has("no-open"),
      });
      console.log(`Chosen: ${world.direction.name} (${world.id}). Wrote .deslopify/direction.json, tokens.css, grammar.md and board.png.`);
      return 0;
    }
    case "hook":
      await runHook(rest[0] ?? "");
      return 0;
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
