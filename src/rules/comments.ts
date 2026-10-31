import { CODE_LANGS, SCRIPT_LANGS, commentOf, lineMatches, type RawFinding, type Rule } from "./types.js";

const HEDGE = /\b(this should (work|fix|do)|hopefully|i think|i believe|for now|temporary (fix|hack)|quick (fix|hack)|in a real (app|implementation|project)|simplified (version|implementation)|you (may|might) want to|feel free to|let'?s |now we |here we |we need to)\b/i;
const NARRATION = /^(loop|iterate) (over|through)|^(increment|decrement)s? |^(call|calls) the |^return(s)? the (result|value)|^(set|sets) the |^(check|checks) if |^define (a|the) /i;

export const hedge: Rule = {
  id: "DS-HEDGE",
  phase: "write",
  instruction: "Write comments only to explain why; never narrate what the code does or hedge about it.",
  why: "Narrating and hedging comments are noise that ages badly and signals unreviewed code.",
  langs: CODE_LANGS,
  defaultLevel: "warn",
  check(file) {
    return file.lines.flatMap((text, i): RawFinding[] => {
      const comment = commentOf(text, file.lang);
      if (!comment || !(HEDGE.test(comment) || NARRATION.test(comment))) return [];
      return [{ line: i + 1, message: `Hedging or narrating comment: "${comment.slice(0, 60)}".`, fix: "Delete it, or rewrite it to explain why the code is this way." }];
    });
  },
};

export const stub: Rule = {
  id: "DS-STUB",
  phase: "finish",
  instruction: "Finish what you start: no TODO-implement, placeholder returns or not-implemented throws.",
  why: "Stubs ship as silent bugs; the user assumes the feature works.",
  langs: CODE_LANGS,
  defaultLevel: "warn",
  skipTests: true,
  check(file) {
    return lineMatches(file, /TODO:?\s*implement|not\s+implemented|\bplaceholder (logic|implementation|data|value)\b|raise NotImplementedError|\/\/\s*\.\.\.\s*(rest|more|existing)/i, (_m, line) => ({
      line,
      message: "Unfinished stub left in the code.",
      fix: "Implement it now, or tell the user it is missing and mark it TBD in the plan, not in the code.",
    }));
  },
};

const LOOKS_LIKE_CODE = /^(const|let|var|return|if|for|while|import|export|function|def|class|await)\b|[;{}]\s*$|=\s*[\w"'([{]/;

export const deadComment: Rule = {
  id: "DS-DEAD-COMMENT",
  phase: "finish",
  instruction: "Delete code instead of commenting it out; git keeps the history.",
  why: "Commented-out code confuses the next reader about what is live.",
  langs: CODE_LANGS,
  defaultLevel: "warn",
  check(file) {
    const out: RawFinding[] = [];
    let run = 0;
    file.lines.forEach((text, i) => {
      const comment = /^\s*(\/\/|#)/.test(text) ? commentOf(text, file.lang) : null;
      run = comment !== null && LOOKS_LIKE_CODE.test(comment) ? run + 1 : 0;
      if (run === 3) out.push({ line: i - 1, message: "Block of commented-out code.", fix: "Delete it." });
    });
    return out;
  },
};

export const suppress: Rule = {
  id: "DS-SUPPRESS",
  phase: "finish",
  instruction: "Fix type and lint errors instead of suppressing them (no @ts-ignore, eslint-disable, `as any`, type: ignore).",
  why: "Suppressions hide the exact bugs the checks exist to catch.",
  langs: CODE_LANGS,
  defaultLevel: "warn",
  check(file) {
    return lineMatches(file, /@ts-(ignore|nocheck|expect-error)|eslint-disable|\bas any\b|:\s*any\b(?![\w-])|#\s*type:\s*ignore|#\s*noqa\b|#\s*pyright:\s*ignore/, (m, line) => ({
      line,
      message: `Suppression \`${m[0].trim()}\` added.`,
      fix: "Fix the underlying type or lint error; use `unknown` and narrow instead of `any`.",
    }));
  },
};

export const debug: Rule = {
  id: "DS-DEBUG",
  phase: "finish",
  instruction: "Remove debug output (console.log, print) before finishing; use the project's logger for real logs.",
  why: "Debug output leaks data and clutters the console in production.",
  langs: CODE_LANGS,
  defaultLevel: "warn",
  skipTests: true,
  check(file) {
    const pattern = SCRIPT_LANGS.includes(file.lang) ? /\bconsole\.(log|debug|dir|table)\(|\bdebugger;/ : /^\s*print\(/;
    return lineMatches(file, pattern, (_m, line) => ({ line, message: "Debug output left in.", fix: "Delete it, or use the project logger." }));
  },
};
