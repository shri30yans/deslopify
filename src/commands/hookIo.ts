/** Claude Code hook protocol: what arrives on stdin and the JSON a hook prints (docs: code.claude.com/docs/en/hooks). */

export interface HookPayload {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
  };
}

export type HookOutput = Record<string, unknown>;

export const denyWrite = (reason: string): HookOutput => ({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
});

export const addContext = (event: "SessionStart" | "PostToolUse", text: string): HookOutput => ({
  hookSpecificOutput: { hookEventName: event, additionalContext: text },
});

export const blockStop = (reason: string): HookOutput => ({ decision: "block", reason });

export const noteToUser = (message: string): HookOutput => ({ systemMessage: message });

export async function readPayload(): Promise<HookPayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as HookPayload;
}
