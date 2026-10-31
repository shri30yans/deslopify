// Minimal glob matching: **, *, ?, {a,b}. Paths are repo-relative, POSIX-style.

const cache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) return cached;
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      out += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else if (c === "{") out += "(?:";
    else if (c === "}") out += ")";
    else if (c === "," && out.lastIndexOf("(?:") > out.lastIndexOf(")")) out += "|";
    else out += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  const re = new RegExp(`^${out}$`);
  cache.set(glob, re);
  return re;
}

export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}
