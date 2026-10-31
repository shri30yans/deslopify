import type { CodeSymbol, SymbolKind } from "./types.js";

const SYNONYMS: Record<string, string> = {
  render: "format", display: "format", print: "format", stringify: "format", fmt: "format",
  fetch: "get", load: "get", retrieve: "get", read: "get", find: "get", lookup: "get",
  make: "create", build: "create", new: "create", generate: "create",
  delete: "remove", destroy: "remove", del: "remove",
  set: "update", patch: "update", edit: "update",
  has: "check", validate: "check", verify: "check", is: "check",
  currency: "money", price: "money", amount: "money", cost: "money", rupee: "money", rupees: "money", inr: "money", dollars: "money",
  datetime: "date", timestamp: "date", time: "date",
  account: "user", member: "user", profile: "user",
  btn: "button", dialog: "modal", popup: "modal", dropdown: "select", picker: "select",
  tile: "card", title: "heading", headline: "heading", props: "", util: "", utils: "", helper: "", helpers: "",
};

/** "formatPriceUSD" → {format, money, usd}. */
export function nameWords(name: string): Set<string> {
  const raw = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
  return new Set(raw.map((w) => SYNONYMS[w] ?? w).filter(Boolean));
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}

export const FAMILY: Record<SymbolKind, string> = {
  function: "fn", hook: "fn", const: "value", component: "ui", class: "class", type: "type", interface: "type", enum: "type",
};

export interface ReuseMatch<T extends CodeSymbol> {
  existing: T;
  similarity: number;
}

/** Existing symbols in other files that do the same job as `candidate`, best first. */
export function findSimilar<T extends CodeSymbol>(candidate: CodeSymbol, index: readonly T[], threshold = 0.67): ReuseMatch<T>[] {
  const words = nameWords(candidate.name);
  const family = FAMILY[candidate.kind];
  return index
    .filter((s) => s.file !== candidate.file && FAMILY[s.kind] === family)
    .map((s) => ({ existing: s, similarity: s.name === candidate.name ? 1 : jaccard(words, nameWords(s.name)) }))
    .filter((m) => m.similarity >= threshold && nameWords(m.existing.name).size > 0)
    .sort((a, b) => b.similarity - a.similarity);
}
