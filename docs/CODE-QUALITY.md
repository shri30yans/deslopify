# The code-quality engine

How DeSlopify stops code slop: codemaps, LSP, per-language detectors, clear instructions and engineering patterns. A companion to [RESEARCH.md](RESEARCH.md) (causes and the design side) and [STARTUP.md](STARTUP.md) (product and business).

---

## 0. The pipeline

Each layer catches what the one before it missed. The cheapest checks run first:

```
 ① MAP            ② NAVIGATE         ③ GUARD             ④ CHECK              ⑤ REVIEW
 codemap          LSP                pre-write hook      post-edit hook       stop hook
 ─────────        ─────────          ─────────           ─────────            ─────────
 what exists,     exact defs,        block duplicates,   per-language         full repo pass
 where things     refs, types,       wrong-layer         detectors on the     on touched files
 go, what to      diagnostics        imports, banned     changed lines only   + design review
 reuse                               values, new deps                         → top 3 fixes
 ~1.5k tokens     on demand          <1s                 <3s                  <60s
 always loaded
```

**One output format for everything.** Each tool's output is normalized to SARIF (ESLint, Ruff, Semgrep and golangci-lint already emit it), then to a short agent message with a rule ID, the fix, and why. **Baseline mode is on by default:** in an existing repo, only *new* problems on *changed* lines are reported. Without this, legacy noise buries everything and people turn the tool off.

---

## 1. Codemaps that prevent slop

Most codemaps (DeepWiki, Windsurf Codemaps) are built to help **humans understand** code. Ours is built to stop an **agent from writing the wrong code**. That needs different content.

### What it prevents

| Slop | How the codemap stops it |
|---|---|
| A second `formatDate` | **Reuse index** lists canonical helpers with signatures |
| A component in the wrong folder or layer | **Atlas** says what each folder is for and what it may import |
| A new `<Select>` when one exists | Components marked **canonical** ("use this one") |
| Editing a generated or archived file | Folders marked **do not edit** |
| Inconsistent naming | **Glossary** of domain terms (Ship4IND: "enquiry", not "inquiry"/"lead") |
| Growing a file that's already too big | **Size status** per module |

### Three tiers, budgeted

| Tier | Contents | Budget | Loaded |
|---|---|---|---|
| **L0 Atlas** | Layers and allowed import directions, folder purposes, entry points, do-not-edit paths, glossary | ≤ 500 tokens | Always (SessionStart) |
| **L1 Reuse index** | Top exported symbols with one-line signature + purpose, canonical markers, duplicate clusters, ranked by importance | ≤ 1,000 tokens, task-biased | Always; re-ranked per task |
| **L2 Detail** | Full symbol bodies, references, call graphs | unbounded | On demand through LSP / MCP |

### How it's built

1. **Extract with tree-sitter:** definitions and references for every file, in any language (one grammar per language, no compiler needed).
2. **Build a graph:** files and symbols as nodes, references as edges.
3. **Rank with personalized PageRank**, biased toward the files and terms of the current task. This is Aider's proven repo-map technique: by default Aider fits the top-ranked definitions into ~1k tokens by binary-searching how many symbols fit ([pattern write-up](https://www.agentpatterns.ai/context-engineering/repository-map-pattern/)).
4. **Add the slop-specific fields** no other map has: layer, canonical, deprecated, forbidden imports, size status, duplicate cluster.
5. **One-line purposes** per module, written once by an LLM and **cached by content hash**, so they're regenerated only when the file changes.
6. **Stay fresh:** incremental update on every PostToolUse for changed files; full rebuild on commit.

### Format (what the agent actually sees)

```markdown
# Codemap: ship4ind  (auto-generated, do not edit)

## Layers (imports flow down only)
app → components/sections → components/ui → lib → data
api/ is server-only: never import from components/

## Do not edit
archive/ · dist/ · src/data/worldMapDots.js (generated: npm run generate:map-dots)

## Reuse first
| Need | Use | Signature |
|---|---|---|
| class merging | lib/cn.ts `cn` ★ | (...classes) => string |
| select/dropdown | ui/Select.tsx `Select` ★ | ({options, value, onChange, label}) |
| section title | ui/SectionHeading.tsx `SectionHeading`, `Kicker` ★ | ({title, …}) |
| button styles | ui/button.ts `buttonClass` ★ | (variant?, size?, className?) => string |
| enquiry types | lib/enquiry.ts `Enquiry`, `EnquiryKind`, `REQUEST_OPTIONS` ★ | types + option list |
| site copy, rates | data/content.ts | all user-facing text lives here |

## Watch
globe.ts 736 lines (budget 300) · split before adding
Glossary: enquiry (not inquiry/lead) · route · category
```

### The reuse check (PreToolUse guard)

When the agent creates a new file or a new exported symbol:

1. **Name similarity:** split identifiers into words (`formatPrice` → format, price) and compare against the index, with synonyms (format/render/display, get/fetch/load).
2. **Signature similarity:** compare parameter and return types through LSP hover or tree-sitter.
3. **Body similarity:** normalize the AST (rename locals, drop literals), then MinHash it to find near-clones.
4. **If similarity > threshold → block** with: *"`formatCurrency` in lib/format.ts does the same (91%). Use it, or add an option to it."*

---

## 2. Using LSPs

Tree-sitter knows *syntax*. A language server knows *meaning*: types, where a symbol really comes from, every caller. That kills a whole class of slop.

| LSP feature | Slop it prevents | Rule for the agent |
|---|---|---|
| **Diagnostics** | Hallucinated imports and APIs, type errors, unused variables | An edit may not add new diagnostics |
| **Find references** | Changing a signature and breaking callers; "unused" code that's actually used | Before changing a signature, list its callers and update them all |
| **Rename** | Text find-and-replace renames that miss or over-match | Rename through LSP, never with search/replace |
| **Workspace symbols** | Duplicates | Search symbols before creating one (feeds the reuse check) |
| **Go to definition / hover** | Guessing a type or API shape | Read the real definition before using an unfamiliar API |
| **Call hierarchy** | Editing a hot path blind | Check who calls it before refactoring |
| **Code actions** | Messy imports | Organize imports after an edit |

### What exists already
- **Claude Code** has official code-intelligence plugins (`typescript-lsp`, `pyright-lsp`, `gopls-lsp`, `rust-analyzer-lsp`) that give the agent live diagnostics and go-to-definition. The language server binary has to be installed separately ([docs](https://code.claude.com/docs/en/plugins/code-intelligence.md)). Community guides say the built-in LSP tool is off by default (`ENABLE_LSP_TOOL`).
- **Serena** (MCP) gives agents symbol-level tools (`find_symbol`, `find_referencing_symbols`, `get_symbols_overview`, insert-after-symbol edits) across 30+ languages through LSP ([Serena](https://github.com/oraios/serena)).

### Our approach
1. **Don't build an LSP client for the agent.** Use the platform's plugin or Serena, and configure them in `init`.
2. **Do use LSP headlessly inside our hooks:** diagnostics after each edit, reference counts for dead-code and "changed signature, N callers not updated" checks, workspace symbols for the reuse check.
3. **Fall back** to tree-sitter when no server is installed. Lower precision, but it still works.
4. **Manage the cost:** pyright and rust-analyzer can use a lot of RAM on big repos. Start servers lazily per language, share one between hooks, and stop idle ones.

---

## 3. Detectors for each language

We wrap the best existing tool in each slot and add **our own AI-slop rules** (written in ast-grep, so one rule format works across languages).

| Language | Format | Lint | Types | Dead code | Layers | Complexity / dup | LSP |
|---|---|---|---|---|---|---|---|
| **TS / JS** ★ MVP | Biome | Biome (fast) + ESLint for plugins: `sonarjs`, `unicorn`, `react-hooks`, `jsx-a11y`, `tailwindcss` | `tsc --strict` (incremental) | **knip** | **dependency-cruiser** | ESLint `complexity`, **jscpd** | vtsls / typescript-language-server |
| **CSS / Tailwind** ★ MVP | Biome / Prettier | **Stylelint** (`declaration-strict-value` → tokens only), `tailwindcss/no-arbitrary-value` | — | unused classes/tokens (our check) | — | — | css-ls / tailwind LS |
| **HTML / JSX design** ★ MVP | — | our design detectors (RESEARCH.md §1) + **axe-core** | — | — | — | — | — |
| **Python** | Ruff format | **Ruff** (1,000+ rules, auto-fix) | **pyright** / basedpyright (or mypy, ty) | **vulture** | **import-linter** | radon / xenon, jscpd | pyright |
| **Go** | gofmt, goimports | **golangci-lint** (staticcheck, revive, dupl, unused, gocyclo) | compiler, `go vet` | `unused` | depguard / go-arch-lint | gocyclo, dupl | gopls |
| **Rust** | rustfmt | **clippy** (pedantic) | compiler | cargo-machete / udeps | crate boundaries | clippy cognitive_complexity | rust-analyzer |
| **Swift** | SwiftFormat | **SwiftLint** | compiler | **Periphery** | module rules | SwiftLint | sourcekit-lsp |
| **Kotlin / Java** | ktlint / google-java-format | **detekt** / PMD, Error Prone | compiler | detekt / PMD | **ArchUnit** | detekt, PMD CPD | kotlin-lsp / jdtls |
| **PHP** | PHP-CS-Fixer | **PHPStan** / Psalm | PHPStan | PHPStan | **Deptrac** | phpcpd | intelephense |
| **Ruby** | RuboCop | **RuboCop** | Sorbet | debride | packwerk | flay | ruby-lsp |
| **C#** | dotnet format | Roslyn analyzers | compiler | Roslyn | NetArchTest | — | Roslyn LS |
| **Any** | — | **Semgrep** (security), **ast-grep** (our rules) | — | — | — | **jscpd** (150+ formats) | — |

**Order:** TS/JS + CSS + design first (that's the web-builder market), Python next, then Go and Swift.

### AI-specific slop rules (our own, cross-language)

These are the patterns standard linters don't catch because humans rarely write them:

| ID | Pattern | Example |
|---|---|---|
| `DS-HEDGE` | Hedging or narrating comments | `// This should work`, `# Now we loop over the items` |
| `DS-STUB` | Placeholder logic shipped | `// TODO: implement`, `return []  # placeholder`, `throw new Error("Not implemented")` |
| `DS-SWALLOW` | Swallowed errors | `catch {}`, `except: pass`, `catch (e) { console.log(e) }` |
| `DS-DEBUG` | Leftover debug output | `console.log`, `print(` outside CLI/tests |
| `DS-SUPPRESS` | New suppressions added | `@ts-ignore`, `# type: ignore`, `eslint-disable`, `as any` |
| `DS-DEAD-COMMENT` | Commented-out code blocks | 3+ consecutive commented lines that parse as code |
| `DS-PARANOID` | Redundant defensive checks | null-checking a non-nullable type; try/catch around code that can't throw |
| `DS-OVERABSTRACT` | An abstraction with one use | interface with a single implementation; `XManager`/`XFactory`/`XService` used once; a wrapper that only forwards |
| `DS-BOOL-SOUP` | Behaviour driven by many flags | 3+ boolean params or props |
| `DS-MOCK-PROD` | Fake data on production paths | `mockUsers`, `faker` imported outside tests/fixtures |
| `DS-DUP-TYPE` | The same shape typed twice | two interfaces with the same fields |
| `DS-REINVENT` | Hand-rolled stdlib | custom `deepClone`, `debounce` or `uuid` when the platform or an existing dep has it |
| `DS-TRIVIAL-DEP` | New dependency for a one-liner | adding a package for something already in the stdlib |
| `DS-SIZE` | Over budget | file > 300 lines, function > 50, params > 4, nesting > 3 |

Example rule (ast-grep YAML):

```yaml
id: DS-SWALLOW
language: TypeScript
severity: error
message: "Error swallowed. Handle it, rethrow it, or return a typed error."
note: "Why: silent failures hide bugs. Ship4IND's enquiry form only reports success when the provider accepts."
rule:
  kind: catch_clause
  has:
    kind: statement_block
    not:
      has: { any: [ { kind: throw_statement }, { kind: return_statement }, { pattern: "$LOG.error($$$)" } ] }
```

---

## 4. Writing clear instructions

Impeccable's lesson: *long* instructions get followed *partly*. Our rules for writing rules:

| # | Rule | Because |
|---|---|---|
| 1 | **Budget:** always-on instructions ≤ 1.5k tokens in total; everything else is loaded on demand | Attention dilutes with length |
| 2 | **One rule = one sentence = one check ID** | A rule nobody checks gets ignored; a check nobody explains feels random |
| 3 | **Say what to do.** Every "don't" comes with its replacement ("Use `cn()`, not template strings for classes") | Bans without alternatives produce avoidance, not quality |
| 4 | **Concrete over adjectives.** "≤ 300 lines" not "keep files small"; "Manrope 700 for display" not "modern type" | Adjectives mean something different on every run |
| 5 | **Examples beat descriptions.** Point to a real file: "Sections look like `sections/Process.tsx`" | Models imitate better than they interpret |
| 6 | **State the precedence:** user's request > direction contract > project rules > defaults | Removes the hedging that comes from conflicting rules |
| 7 | **At most one level of conditions.** No "if X, unless Y, except when Z" | Nested conditions are where models drift |
| 8 | **The same ID in the instruction and the hook message** | The agent links the rule it read to the failure it hit |
| 9 | **Each rule lives in one place** | Copies drift and start contradicting each other |
| 10 | **Lint the instructions themselves:** token count, rules without IDs, "don't" without a replacement, vague adjectives | We practise what we enforce |

### File layout

```
AGENTS.md                 ← ≤ 60 lines, read by every agent (Claude Code, Codex, Cursor)
CLAUDE.md                 ← one line: @AGENTS.md
.deslopify/
  rules.md                ← the rule list with IDs (generated from config)
  codemap.md              ← L0 + L1, auto-generated
  direction.json          ← the design contract (see STARTUP.md)
  decisions.md            ← accepted and rejected decisions
```

### An example `AGENTS.md`

```markdown
# How to work in this repo

Precedence: the user's request > .deslopify/direction.json > these rules > your defaults.

## Before you write
- Read .deslopify/codemap.md. Reuse anything marked ★ before creating something new. [DS-REUSE]
- Put code in the layer the codemap names; imports flow down only. [DS-LAYER]
- Use LSP to find references before changing any exported signature. [DS-REFS]

## While you write
- Style with tokens from src/style.css only; no raw hex, no arbitrary Tailwind values. [DS-TOKEN]
- User-facing text and numbers go in src/data/content.ts. [DS-CONTENT]
- Keep files ≤ 300 lines and functions ≤ 50; split by responsibility. [DS-SIZE]
- Handle every error: rethrow, return a typed error, or show the user. [DS-SWALLOW]
- Vendor SDKs (Resend, Stripe) only inside adapters/. [DS-ADAPTER]
- Mark unverified business claims TBD. [DS-CLAIM]

## Before you finish
- No new diagnostics, lint errors or suppressions. [DS-CLEAN]
- If UI changed, the review hook renders it; fix what it reports. [DS-REVIEW]

Examples of good code here: src/components/sections/Process.tsx, src/lib/enquiry.ts
```

### Hook messages follow one template

```
[DS-REUSE] You created `formatPrice` in lib/money.ts.
`formatCurrency` in lib/format.ts already does this (91% similar).
Fix: use it, or add a `currency` option to it.
Why: one implementation per behaviour.
```

Every message gives: **ID, what happened, where, the fix, why**. A message with no fix in it is a bug in our tool.

---

## 5. Engineering patterns, engraved

Agents fail in **both** directions: *too little* structure (duplication, god files) and *too much* (factories and managers for a single use). Each pattern below comes with the detector that enforces it.

| Pattern | Rule | Detector |
|---|---|---|
| **Feature folders + layers** | `app → features/<x>/{ui,model,api} → shared/{ui,lib} → adapters` ; imports flow down | dependency-cruiser / import-linter / ArchUnit, `DS-LAYER` |
| **Ports and adapters** | Vendor SDKs are wrapped once in `adapters/`; the domain calls the interface | `DS-ADAPTER` import rule |
| **Content as data** | Copy, prices and claims live in `data/`; components render them | `DS-CONTENT` (long string literals in JSX) |
| **Logic out of views** | Components render; hooks/`lib` compute; pure functions get tests | function with JSX + 20 lines of logic → warn |
| **Compose, don't configure** | Compound components and `children` slots instead of 3+ boolean props | `DS-BOOL-SOUP` |
| **Variants, not copies** | One component + `cva`/token variants instead of `ButtonBlue`, `ButtonBig` | jscpd + name-cluster check |
| **Parse at the boundary** | Validate input once (zod/pydantic) where it enters; trust types inside | untyped `JSON.parse`/`request.json()` → warn |
| **Typed errors** | Boundaries return `Result`/typed errors; nothing is swallowed | `DS-SWALLOW` |
| **One source of truth for types** | Types generated from schema/API once, imported everywhere | `DS-DUP-TYPE` |
| **Rule of three** | Extract on the third use, not the first | `DS-OVERABSTRACT` (single-use abstractions) + jscpd (third copy) |
| **Small units** | file ≤ 300 lines, function ≤ 50, params ≤ 4, nesting ≤ 3 | `DS-SIZE` |
| **Domain language** | Names use the glossary terms | glossary check on new identifiers |
| **SOLID, practically** | SRP = small units + layers; OCP = variants/composition; LSP/ISP = small typed props, no `any`; DIP = adapters | the detectors above, mapped |

All thresholds are **defaults in config**, so a team can tune them. The rule ID stays the same either way.

---

## 6. MVP scope for the engine

| Week | Ship |
|---|---|
| 1 | Codemap L0 + L1 for TS (tree-sitter + PageRank + canonical markers), SessionStart injection |
| 2 | PreToolUse guard: reuse check (name + signature), layer imports, token/arbitrary-value guard, do-not-edit paths |
| 3 | PostToolUse check: Biome + ESLint subset + tsc incremental + jscpd + 8 `DS-*` ast-grep rules, SARIF → messages, baseline mode |
| 4 | LSP-backed checks (diagnostics, references for signature changes and dead code) with tree-sitter fallback; `AGENTS.md` generator + instruction linter |
| then | Python pack (Ruff, pyright, vulture, import-linter), body-similarity reuse check, Go/Swift packs |

**Test bed:** Ship4IND. Its codemap is the example above, and its real history (the route-buffer bugs, rejected motifs, the enquiry adapter) gives us honest before/after cases.

---

### Sources
- [Claude Code code-intelligence plugins](https://code.claude.com/docs/en/plugins/code-intelligence.md) · [wmedia: Claude Code LSP tip](https://wmedia.es/en/tips/claude-code-lsp-code-intelligence) · [amazingcto: LSP in Claude](https://www.amazingcto.com/lsp-in-claude/)
- [Serena](https://github.com/oraios/serena) · [Serena overview (Greptile)](https://www.greptile.com/grepository/serena)
- [Repository map pattern: AST + PageRank](https://www.agentpatterns.ai/context-engineering/repository-map-pattern/) · [Aider token budgets](https://fast.io/resources/aider-token-limit.md)
- [ast-grep rule configuration](https://gurubase.io/g/ast-grep/configure-ast-grep-lint-rules) · [CodeRabbit ast-grep instructions](https://docs.coderabbit.ai/configuration/ast-grep-instructions)
- [Biome vs ESLint vs Oxlint 2026](https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026) · [ESLint vs Biome 2026](https://reintech.io/blog/eslint-vs-biome-javascript-linting-comparison-2026)
- [Ruff vs Pylint](https://pydevtools.com/handbook/explanation/how-do-ruff-and-pylint-compare/) · [Ruff FAQ](https://docs.astral.sh/ruff/faq)
- [GitClear 2025 AI code quality](https://www.gitclear.com/ai_assistant_code_quality_2025_research)
