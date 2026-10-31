import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadContext } from "../core/engine.js";
import { PROJECT_RULES } from "../rules/registry.js";
import { isUi, langOf } from "../core/files.js";
import { formatReport, type Finding } from "../core/findings.js";
import { auditFiles, openTools } from "../core/pipeline.js";
import { readState, writeState } from "../core/state.js";
import { BOARD_FILE, DIRECTION_FILE, loadDirection } from "../core/direction.js";
import { newRenderFindings } from "../review/baseline.js";
import { captureReview, type ReviewResult } from "../review/capture.js";
import { blockStop, noteToUser, type HookOutput, type HookPayload } from "./hookIo.js";

function reviewInstructions(root: string, round: number, shots: ReviewResult["shots"], hasDirection: boolean): string {
  return [
    `Visual review, round ${round}. Open these screenshots (one per viewport) and look at them:`,
    ...shots.map((s) => `- ${s.viewport}: ${s.path}`),
    ...(existsSync(join(root, BOARD_FILE)) ? [`The look the user chose (the target to match): ${join(root, BOARD_FILE)}`] : []),
    hasDirection
      ? `Compare them with ${DIRECTION_FILE}: hierarchy, spacing, type, colour, crop, one clear focal point at every width.`
      : "Judge hierarchy, spacing, type, colour and crop; one clear focal point at every width.",
    "If your change did not alter how the page looks, say so and stop.",
    "Otherwise fix the biggest gaps that your change caused or left, then stop. Do not restyle, recolour or refactor anything you did not need to touch.",
  ].join("\n");
}

/**
 * At stop: audit everything touched this session. Code problems and measured render problems block;
 * the first UI round also asks the agent to look at the screenshots. After `maxRounds` blocked stops
 * it lets go and tells the user what is still open.
 */
export async function stop(root: string, payload: HookPayload): Promise<HookOutput | null> {
  const state = readState(root, payload.session_id);
  const touched = state.touched.filter((p) => existsSync(join(root, p)));
  if (touched.length === 0) return null;

  const ctx = loadContext(root);
  const { maxRounds } = ctx.config.review;
  const round = state.reviewRounds + 1;
  const findings: Finding[] = auditFiles(root, ctx, openTools(root, ctx), touched, "git", { project: true });
  const parts: string[] = [];
  let shots: ReviewResult["shots"] = [];

  if (touched.some((p) => isUi(langOf(p)))) {
    const review = await captureReview(root, ctx.config, round);
    findings.push(...newRenderFindings(root, review.findings));
    shots = review.shots;
  }

  // Per-edit checks already showed the warnings; only project-wide ones (duplicates) are new at stop.
  const isProjectWarning = (f: Finding): boolean => PROJECT_RULES.some((r) => r.id === f.rule);
  const open = findings.filter((f) => f.level === "block" || (round === 1 && isProjectWarning(f)));
  if (open.length) parts.push(`${open.length} open issue${open.length === 1 ? "" : "s"}:\n${formatReport(open)}`);
  if (shots.length && round === 1) parts.push(reviewInstructions(root, round, shots, loadDirection(root) !== null));

  if (parts.length === 0) {
    writeState(root, payload.session_id, { touched: [], reviewRounds: 0 });
    return null;
  }
  if (round > maxRounds) {
    writeState(root, payload.session_id, { touched: [], reviewRounds: 0 });
    return noteToUser(`DeSlopify: stopped after ${maxRounds} review rounds with issues still open:\n${formatReport(findings.filter((f) => f.level === "block"))}`);
  }
  writeState(root, payload.session_id, { touched, reviewRounds: round });
  return blockStop(`DeSlopify review (round ${round}/${maxRounds}).\n${parts.join("\n\n")}`);
}
