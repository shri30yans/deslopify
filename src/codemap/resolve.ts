import { posix } from "node:path";

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];

/** Strip `.js` written for NodeNext so `./a.js` can resolve to `./a.ts`. */
const stripJsExt = (p: string): string => p.replace(/\.(m|c)?jsx?$/, "");

/**
 * Resolve an import specifier to a repo-relative file, or null when it names a package.
 * `known` is the set of repo files; `aliases` maps prefixes like "@/" to folders like "src/".
 */
export function resolveImport(
  fromFile: string,
  specifier: string,
  known: ReadonlySet<string>,
  aliases: Record<string, string>,
): string | null {
  let base: string | null = null;
  if (specifier.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  else {
    for (const [prefix, folder] of Object.entries(aliases)) {
      if (specifier.startsWith(prefix)) base = posix.normalize(folder + specifier.slice(prefix.length));
    }
  }
  if (base === null) return null;
  for (const candidate of [base, stripJsExt(base)]) {
    for (const ext of EXTENSIONS) {
      if (known.has(candidate + ext)) return candidate + ext;
    }
  }
  return null;
}

/** The package name for a bare specifier: "@scope/pkg/sub" → "@scope/pkg", "pkg/sub" → "pkg". */
export function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
