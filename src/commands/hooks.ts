import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { loadConfig } from "../core/config.js";
import { loadContext, checkPath } from "../core/engine.js";
import { isSourcePath } from "../core/files.js";
import { formatReport } from "../core/findings.js";
import type { ChangedLines } from "../core/git.js";
import { checkProposed, checkWrittenFile, openTools } from "../core/pipeline.js";
import { markTouched } from "../core/state.js";
import { MAP_FILE } from "../codemap/build.js";
import { GRAMMAR_FILE, loadDirection } from "../core/direction.js";
import { addContext, denyWrite, type HookOutput, type HookPayload } from "./hookIo.js";
import { describeDirection, refreshCodemap, writeCodemap } from "./project.js";

/** Lines of `next` that are not present in `previous`: what this write adds. */
export function addedLines(previous: string, next: string): ChangedLines {
  const available = new Map<string, number>();
  for (const line of previous.split("\n")) available.set(line, (available.get(line) ?? 0) + 1);
  const added = new Set<number>();
  next.split("\n").forEach((line, i) => {
    const left = available.get(line) ?? 0;
    if (left > 0) available.set(line, left - 1);
    else added.add(i + 1);
  });
  return added;
}

/** The file as it will be after the tool runs, or null when the tool call is not a write we understand. */
function proposedText(payload: HookPayload, abs: string): string | null {
  const input = payload.tool_input;
  if (!input) return null;
  if (payload.tool_name === "Write") return input.content ?? null;
  if (payload.tool_name === "Edit" && existsSync(abs) && input.old_string !== undefined && input.new_string !== undefined) {
    const text = readFileSync(abs, "utf8");
    if (!text.includes(input.old_string)) return null;
    return input.replace_all ? text.split(input.old_string).join(input.new_string) : text.replace(input.old_string, () => input.new_string!);
  }
  return null;
}

function repoPath(root: string, payload: HookPayload): { abs: string; rel: string } | null {
  const file = payload.tool_input?.file_path;
  if (!file) return null;
  const abs = isAbsolute(file) ? file : join(payload.cwd, file);
  const rel = relative(root, abs).split("\\").join("/");
  return rel.startsWith("..") ? null : { abs, rel };
}

export function sessionStart(root: string): HookOutput {
  refreshCodemap(root);
  const codemap = readFileSync(join(root, MAP_FILE), "utf8");
  const grammarFile = join(root, GRAMMAR_FILE);
  const grammar = existsSync(grammarFile) ? readFileSync(grammarFile, "utf8") : null;
  return addContext("SessionStart", `${describeDirection(loadDirection(root), grammar)}\n\n${codemap}`);
}

/** Before a write: block only what must never land (generated files, duplicates, wrong-layer imports). */
export function guard(root: string, payload: HookPayload): HookOutput | null {
  const target = repoPath(root, payload);
  if (!target) return null;
  const ctx = loadContext(root);
  const findings = checkPath(ctx.config, target.rel);
  if (findings.length === 0 && isSourcePath(ctx.config, target.rel)) {
    const text = proposedText(payload, target.abs);
    if (text !== null) {
      const previous = existsSync(target.abs) ? readFileSync(target.abs, "utf8") : "";
      findings.push(...checkProposed(ctx, target.rel, text, addedLines(previous, text)));
    }
  }
  const blocking = findings.filter((f) => f.level === "block");
  return blocking.length ? denyWrite(`DeSlopify blocked this write:\n${formatReport(blocking)}`) : null;
}

/** After a write: report what the edit broke, keep the codemap current, remember the file for the stop review. */
export function postEdit(root: string, payload: HookPayload): HookOutput | null {
  const target = repoPath(root, payload);
  const config = loadConfig(root);
  if (!target || !isSourcePath(config, target.rel) || !existsSync(target.abs)) return null;
  const ctx = loadContext(root);
  const { findings, index } = checkWrittenFile(root, ctx, openTools(root, ctx), target.rel);
  writeCodemap(root, index);
  markTouched(root, payload.session_id, target.rel);
  if (findings.length === 0) return null;
  return addContext("PostToolUse", `DeSlopify found ${findings.length} issue${findings.length === 1 ? "" : "s"} in what you just wrote. Fix them before moving on:\n${formatReport(findings)}`);
}
