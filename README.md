# DeSlopify

A quality layer for AI coding agents. It stops the agent shipping slop: duplicate code, tangled layers, generic-looking UI and pages nobody looked at.

It works as a Claude Code plugin plus a CLI. Everything it knows lives as plain files in your repo under `.deslopify/`.

## What it does

| When | What happens |
|---|---|
| **Session start** | The agent gets the design direction and a ~1.5k-token **codemap**: layers, folders, and a reuse table of the exports it should use instead of writing new ones (★ = widely used). |
| **Before a write** | A **guard** blocks what must never land: edits to generated files, a new function that duplicates an existing one, an import that points up a layer. |
| **After an edit** | The file is checked (only the lines you changed): the 25 file rules, the TypeScript language service (type errors, plus callers of any signature you changed), and eslint/ruff if the project uses them. |
| **At stop** | Everything touched is audited again, the page is **rendered at four widths** and measured (overflow, broken images, console errors, axe accessibility), and the agent is asked to compare the screenshots with the look you chose. At most two rounds. |
| **`deslopify pick`** | Your own copy is rendered in three looks ("Worlds"). You click one; it becomes `.deslopify/direction.json`, tokens, layout grammar and the target board. |

## Install

```sh
npm install
npm run build
claude --plugin-dir /path/to/DeSlopify        # loads hooks + skill
cd your-project && /path/to/DeSlopify/bin/deslopify init
```

Requirements: Node 20+, a git repo, and Google Chrome (Playwright drives your installed Chrome; nothing is downloaded). Hooks do nothing in a project until `deslopify init` has created `.deslopify/config.json`.

## Commands

```
deslopify init                 set up this repo (config, rules block in AGENTS.md, codemap)
deslopify sync                 refresh the codemap and the AGENTS.md rules block
deslopify check [files...]     check changed files (or the named ones)
deslopify score                SlopScore for the whole repo
deslopify review               render the page at every viewport and measure it
deslopify baseline             record the page's existing render problems; only new ones block
deslopify rules                list every rule
deslopify pick --brand B --headline H --sub S --cta C --about A [--nav "X,Y"] [--world ID]
```

`score` is `100 * allowance / (allowance + weighted findings)`; blocking findings weigh 5, warnings 1, and the allowance is 20 per 1,000 lines plus 10. It is a trend line, not a grade.

## Configuration

`.deslopify/config.json` is the one place settings live. `init` detects layers, path aliases, linters, generated files and the dev server. Every key has a default (see `src/core/config.ts`). The ones you will touch:

- `layers`: top to bottom; a file may import from its own layer or any layer below.
- `rules`: `{"DS-SIZE": "block"}` changes a level (`block`, `warn`, `off`). An unknown rule id is an error.
- `ignores`: `{rule, files, reason}`. This is the only way to silence a rule, and `reason` is required.
- `linters`: `typescript`, `eslint`, `ruff`. A listed linter that is not installed is an error, never a silent skip.
- `review`: `url`, `devCommand` (started if the URL is not up), `viewports`, `maxRounds`. `init` records the page's existing render problems in `.deslopify/render-baseline.json` (commit it); the stop hook then blocks only on new ones. Re-run `deslopify baseline` when you accept a new state.

## Rules

Every rule has one id, one instruction (these generate the block in `AGENTS.md`), a reason shown with each finding, and a default level. `src/rules/registry.ts` is the only list.

| Rule | Level | Instruction |
|---|---|---|
| `DS-GENERATED` | block | Never edit generated or build output; change its source and regenerate. |
| `DS-REUSE` | block | Before creating a function, component or type, check the codemap's reuse table; use the existing one or extend it. |
| `DS-LAYER` | block | Put code in the layer the codemap names; a file may only import from its own layer or layers below it. |
| `DS-ADAPTER` | warn | Import vendor SDKs (email, payments, AI, databases) only inside adapters/ or server code, behind one function. |
| `DS-SIZE` | warn | Keep files ≤ 300 lines, functions ≤ 50 (components ≤ 120), ≤ 4 parameters and nesting ≤ 3; split by responsibility. |
| `DS-SWALLOW` | warn | Handle every error: rethrow it, return a typed error, or show it to the user; never catch and ignore. |
| `DS-BOOL-SOUP` | warn | Use variants or composition (children, compound components) instead of 3+ boolean flags. |
| `DS-REINVENT` | warn | Use the platform before writing a helper (structuredClone, crypto.randomUUID, Intl, Object.groupBy, Array.flat). |
| `DS-MOCK-PROD` | warn | Keep fake and mock data in tests and fixtures, never on production paths. |
| `DS-HEDGE` | warn | Write comments only to explain why; never narrate what the code does or hedge about it. |
| `DS-STUB` | warn | Finish what you start: no TODO-implement, placeholder returns or not-implemented throws. |
| `DS-DEAD-COMMENT` | warn | Delete code instead of commenting it out; git keeps the history. |
| `DS-SUPPRESS` | warn | Fix type and lint errors instead of suppressing them (no @ts-ignore, eslint-disable, `as any`, type: ignore). |
| `DS-DEBUG` | warn | Remove debug output (console.log, print) before finishing; use the project's logger for real logs. |
| `DS-TOKEN` | warn | Style with the design tokens only: no raw hex/rgb colours outside the token file. |
| `DS-ARBITRARY` | warn | Use the spacing, size and colour scale; no arbitrary Tailwind values like p-[13px]. |
| `DS-FONT` | warn | Use only the fonts named in direction.json (display and text). |
| `DS-GRADIENT-TEXT` | warn | Create emphasis with size, weight or colour, not gradient-filled text. |
| `DS-AI-GRADIENT` | warn | Take gradients from the direction's palette; avoid the default purple→blue/pink sweep. |
| `DS-GLOW` | warn | Give shadows an offset and soft blur in the palette's ink colour; no zero-offset coloured glows. |
| `DS-EMOJI-ICON` | warn | Use the project's icon library (one stroke, one weight) instead of emoji as icons. |
| `DS-NESTED-CARD` | warn | Group with spacing and dividers; never put a card inside a card. |
| `DS-ALT` | warn | Give every image an alt: describe meaningful images, use alt="" for decoration. |
| `DS-PLACEHOLDER` | warn | Use real copy and art-directed assets; mark anything missing as TBD for the user. |
| `DS-STOCK-COPY` | warn | Write copy in the product's own concrete words: say what it does, for whom, with a specific detail. |
| `DS-CONTENT` | warn | Keep user-facing copy, prices and claims in the content/data files; components only render them. |
| `DS-DUPLICATE` | warn | Do not copy-paste blocks between files; extract the shared part once (rule of three: on the third copy at the latest). |
| `DS-TYPE` | block | Leave no new type errors, in your file or in files that call it; fix them, never suppress. |
| `DS-LINT` | warn | Leave no new findings from the project's enabled linters (eslint, ruff). |
| `DS-REFS` | warn | Before changing an exported signature, find its callers with the language service and update every one. |
| `DS-OVERFLOW` | block | No horizontal scrolling at any viewport width, from 320px up. |
| `DS-IMG-BROKEN` | block | Every image must load; fix the path or remove the element. |
| `DS-CONSOLE` | block | The page must load without console errors or uncaught exceptions. |
| `DS-A11Y` | block | Fix serious and critical accessibility violations (contrast, names, labels) the review reports. |
| `DS-REVIEW` | warn | After UI changes, open the review screenshots, compare them with direction.json, and fix the top three gaps. |

## Worlds

A World is a complete design direction: tokens, fonts, layout grammar and a board template. `worlds/` ships four (Sky Globe, Editorial Paper, Dark Instrument, Warm Craft); `pick` shows the three that best match `--about`. A World is a folder with `world.json`, `hero.html` (placeholders `{{brand}} {{headline}} {{sub}} {{cta}} {{nav}} {{fonts}} {{tokens}} {{assets}}`) and `grammar.md`; add one and it appears.

## Design decisions

- **One path for everything.** One config file, one rule registry, one pipeline (`auditFiles`) behind the per-edit check, the stop review, `check` and `score`.
- **No fallbacks.** Missing config, missing codemap, an unknown rule id, an unbundled font, an unreachable dev server, a linter that is enabled but absent: each is an error that says what to do.
- **Baseline.** Hooks report only lines changed since `HEAD`, so a legacy codebase does not drown the agent. `score` and `check <files>` look at everything.

## Where this differs from `docs/`

`docs/` holds the research and plan written before the build. The build differs in these ways:

- The codemap and signature checks use the **TypeScript compiler / language service in-process**, not tree-sitter and not an external LSP. Python extraction is a light line parser.
- There is **no tree-sitter and no LSP fallback**: where a check needs a tool, the tool must be enabled and installed.
- Image generation, the hosted Worlds marketplace, billing and the Cursor/Codex adapters are **not built**. The vision comparison is done by the agent itself looking at the screenshots the stop hook produces.
- The Sky Globe board shows the Earth as a textured disc, not a live Three.js globe.

## Development

```sh
npm test          # builds, then 68 tests (the review tests drive real Chrome)
```
