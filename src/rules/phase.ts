/** When in the work the agent should have a rule in mind. Drives the order of the generated AGENTS.md. */
export type Phase = "before" | "write" | "finish";

export const PHASE_TITLES: Record<Phase, string> = {
  before: "Before you write",
  write: "While you write",
  finish: "Before you finish",
};
