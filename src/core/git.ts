import { execFileSync } from "node:child_process";

export type ChangedLines = Set<number> | "all";

export class GitError extends Error {}

function git(root: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr?.toString().trim();
    throw new GitError(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

export function requireGitRepo(root: string): void {
  if (git(root, ["rev-parse", "--is-inside-work-tree"]).trim() !== "true") throw new GitError(`${root} is not a git repository`);
}

const hasCommits = (root: string): boolean => {
  try {
    git(root, ["rev-parse", "--verify", "HEAD"]);
    return true;
  } catch {
    return false;
  }
};

/**
 * Lines added or modified since HEAD: the baseline, so problems that already existed stay quiet.
 * A file git does not track yet, or a repo with no commits, has no baseline: every line is new.
 */
export function changedLines(root: string, file: string): ChangedLines {
  if (!hasCommits(root) || git(root, ["ls-files", "--", file]).trim() === "") return "all";
  const lines = new Set<number>();
  for (const match of git(root, ["diff", "-U0", "HEAD", "--", file]).matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let i = 0; i < count; i++) lines.add(start + i);
  }
  return lines;
}

export function isChanged(changed: ChangedLines, line: number): boolean {
  return changed === "all" || changed.has(line);
}

/** Tracked files modified since HEAD plus untracked files (not ignored), repo-relative. */
export function changedFiles(root: string): string[] {
  const out = git(root, ["status", "--porcelain", "--untracked-files=all"]);
  return out
    .split("\n")
    .filter((l) => l && !l.startsWith(" D") && !l.startsWith("D "))
    .map((l) => l.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, ""));
}
