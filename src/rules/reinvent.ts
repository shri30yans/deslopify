import { SCRIPT_LANGS, type RawFinding, type Rule } from "./types.js";

/** Hand-rolled helpers the platform already provides. */
const BUILT_INS: Record<string, string> = {
  deepclone: "structuredClone()",
  clonedeep: "structuredClone()",
  uuid: "crypto.randomUUID()",
  generateuuid: "crypto.randomUUID()",
  generateid: "crypto.randomUUID()",
  sleep: "`await new Promise(r => setTimeout(r, ms))` once in lib, or `node:timers/promises`",
  isempty: "`Object.keys(x).length === 0` or `!arr.length` inline",
  flatten: "Array.prototype.flat()",
  groupby: "Object.groupBy()",
  uniq: "`[...new Set(arr)]`",
  unique: "`[...new Set(arr)]`",
  formatdate: "Intl.DateTimeFormat (or the project's existing date helper)",
  formatcurrency: "Intl.NumberFormat with style: 'currency' (or the project's existing helper)",
  formatnumber: "Intl.NumberFormat",
  pluralize: "Intl.PluralRules",
  padstart: "String.prototype.padStart()",
  range: "`Array.from({ length: n }, (_, i) => i)`",
};

export const reinvent: Rule = {
  id: "DS-REINVENT",
  phase: "write",
  instruction: "Use the platform before writing a helper (structuredClone, crypto.randomUUID, Intl, Object.groupBy, Array.flat).",
  why: "Hand-rolled copies of built-ins are slower, buggier and one more thing to maintain.",
  langs: SCRIPT_LANGS,
  defaultLevel: "warn",
  check(file) {
    const out: RawFinding[] = [];
    file.lines.forEach((text, i) => {
      const m = /\b(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>)/.exec(text);
      const name = m?.[1] ?? m?.[2];
      const builtIn = name ? BUILT_INS[name.toLowerCase()] : undefined;
      if (name && builtIn) out.push({ line: i + 1, message: `\`${name}\` re-implements something the platform provides.`, fix: `Use ${builtIn}.` });
    });
    return out;
  },
};
