# Why agents write slop, and how to stop it

Research notes for DeSlopify. Covers root causes, how Impeccable actually works (read from its installed v4.6.0 source), predefined website components, design hooks, the tools that already find slop, and what we should build.

---

## 1. Why agents write slop

Slop isn't one bug. It's eight separate causes that compound:

| # | Cause | What's going on | Evidence |
|---|---|---|---|
| 1 | **Distributional convergence** | The model predicts the most likely next token. In web design, "most likely" means Inter, centred hero, three feature cards, purple-blue gradient | Anthropic's own term for it ([Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)): without direction, Claude drifts to the high-probability centre |
| 2 | **Typicality bias from preference training** | Human raters prefer familiar outputs, so alignment training sharpens the model *further* toward the typical. That's mode collapse | [Verbalized Sampling, arXiv 2510.01171](https://arxiv.org/abs/2510.01171): typicality bias in preference data is a main cause of mode collapse; asking for *several options with probabilities* restores diversity |
| 3 | **Blindness** | The agent writes CSS it never sees. It can't tell the hero is cramped or that a phone wraps the headline into five lines | Ship4IND only got good after ~126 review screenshots. Superdesign calls Claude "a great front-end engineer and a blind designer" ([source](https://www.superdesign.dev/blog/claude-code-ui-design)) |
| 4 | **Every unanswered question gets a default** | "Make a landing page" leaves ~12 design axes open (type, palette, density, layout grammar, imagery, motion…). Each open axis falls back to the average | A brief plus a skill beats the skill alone ([wmedia](https://wmedia.es/en/tips/claude-code-frontend-design-skill)) |
| 5 | **No sight of the codebase** | The agent can't see existing components, so it writes a new one. Duplicates pile up | [GitClear 2025](https://www.gitclear.com/ai_assistant_code_quality_2025_research): ~8× rise in duplicated 5+ line blocks in 2024; copy-paste overtook moved/refactored code for the first time |
| 6 | **No memory** | Decisions live in chat. Rejected ideas come back next session | Ship4IND: the airliner motif was rejected four times before it was written into memory |
| 7 | **Optimising for "done", not "good"** | The agent stops when it compiles. Nothing in its definition of done involves looking at the result | Same Ship4IND loop: build success ≠ visual approval (now written into its `visual-review.md`) |
| 8 | **Content vacuum** | No real copy or images, so decoration fills the space: icon-in-circle cards, gradient blobs, lorem, "Get started today" | Slop tells cluster where real content is missing |

Two more causes come **from the tools that are meant to fix slop:**

| # | Cause | What's going on |
|---|---|---|
| 9 | **Instruction overload** | Thousands of words of rules dilute attention. The model follows a random subset, so results are inconsistent |
| 10 | **Negative instructions** | "Never use X" lists define taste as avoidance. You get *nothing wrong*, not *something good*, and naming the banned thing can even prime it |

### The tells (what a detector should look for)

**Visual:** Inter/Geist/system font as the display voice · purple→blue gradients · gradient text · glow shadows · three equal icon+heading+text cards as the page structure · nested cards · same fade-up on every section · eyebrow pill above every heading · stat-hero template (big number, small label) · glassmorphism as decoration · emoji or Unicode as icons · rounded-2xl on everything · centred everything · untinted grey text on coloured backgrounds · unthemed browser surfaces (selection, scrollbars, caret, focus ring) · stock "Get started" / "Unlock the power of" copy · placeholder images or none.

**Code:** a third `formatDate` · 600+ line components · inline magic numbers and hex · arbitrary Tailwind values (`p-[13px]`) · logic in JSX · vendor SDKs imported from UI · dead exports and files · hedging comments ("// This should work") · hallucinated imports · `any` in public types · copy-pasted variants instead of props.

**Copy:** "Seamless", "elevate", "unlock", "in today's fast-paced world", rule-of-three lists, em-dash cadence, claims nobody verified.

---

## 2. How Impeccable actually works (from the installed v4.6.0 source)

### The parts

| Part | What it is | Size |
|---|---|---|
| `SKILL.md` | Router: principles, setup, a table of 23 commands | 87 lines |
| `reference/*.md` | One playbook per command plus `craft-floor`, `new-work`, mode files | ~40 files, ~5,700 lines |
| `scripts/impeccable` | Self-contained binary: `context`, `detect`, `concept-seed`, `serve-question`, `generate-image`, `hooks`, `doctor` | — |
| `hooks/hooks.json` | **SessionStart** (prep), **PostToolUse on Edit/Write** (detector, 5s), **Stop** (deep pass, 30s) | 3 hooks |
| Subagents | asset-producer, documenter, finish-reviewer, manual-edit-applier | 4 |
| Project files | `PRODUCT.md` (product truth), `DESIGN.md` (visual system), `.impeccable/config.json` (hook + ignore config) | — |

### The flow for new work
1. `init` writes PRODUCT.md (audience, product truth).
2. The surface is classified into a **mode**: Persuade, Operate, Read, or Experience.
3. The model lists **7 "cultural" candidate worlds** from the audience's life, then turns them into directions.
4. `concept-seed` **rolls dice** to assign the direction and deal "challenger" worlds from a catalog, to "break the ranking rut".
5. The model judges each challenger (wins / competitive / declined) and writes "raises" into the assigned direction.
6. A local **decision page** shows cards (with image comps if image generation exists). There's a re-roll in three registers (plain/safer/bolder), a steer field, a "canon" exit, and a comp-led vs code-led toggle.
7. Build. **craft-floor.md** loads before any edit (quality floor + bans).
8. Hooks run the detector; the finish-reviewer audits against the chosen comp.

### The detector
Two tiers. **Per edit:** mechanical, unambiguous problems (broken images, overflow, contrast, gradient text, glow shadows, design-system drift). **At Stop:** everything taste-related (copy cadence, palette, type, rhythm), run once over all touched UI files and deduplicated. Exceptions go through `ignore-value / ignore-file / ignore-rule` with a recorded reason.

### What's genuinely good (keep these ideas)
- **Two-tier hook timing.** Cheap mechanical checks per edit, taste at the end. This is the right architecture.
- **Product truth and visual system kept separate** (PRODUCT.md vs DESIGN.md).
- **Rendered options to choose from** instead of mood words.
- **Ignores need a named reason**, which keeps suppressions reviewable.
- Some sharp craft insights: theme the *browser surfaces* (selection, caret, scrollbars, focus); shadows need offset and blur; one authored motion moment, not effects everywhere.

### Why it feels poor in practice

| Problem | In the source |
|---|---|
| **Instruction overload on the model** | Single paragraphs in `new-work.md` run past 1,000 words with nested conditions (registers, verdicts, raises, build-path toggles, exit codes). Models can't hold all of that, so they follow part of it differently each run |
| **Cognitive load on the user** | 23 commands, 4 modes, 3 re-roll registers, comp-led/code-led, pin/unpin, doctor. You need design vocabulary to drive the design tool |
| **Randomness as taste** | Dice pick the direction. That breaks the rut, but it often lands on directions that don't fit the product, and the fix is more re-rolls |
| **Absolute bans** | "A kicker or eyebrow above a heading… no brief earns it back." Ship4IND's hero has a kicker ("INTERNATIONAL SOURCING & SHIPPING") and it works. Bans can't replace judgment |
| **Taste derived from text** | Seven cultural candidates, fusions, "raises" — long reasoning chains before a single pixel exists. Prone to costume-y concepts |
| **No library of positive examples in code** | Catalog images are labelled "inspiration, never the promise of the build". There's no coded, proven section kit to start from |
| **Slow** | Many steps and image comps before the first build |
| **Design only** | Nothing about duplication, layering, or the codemap |

**Lesson for us:** keep the *architecture* (hooks in two tiers, product/design files, rendered choices, finish review). Replace the *method* (dice, bans, essays) with **examples, constraints and a short contract**.

---

## 3. How to prevent slop: ten design patterns

| # | Pattern | Fixes cause | How |
|---|---|---|---|
| P1 | **Show, don't tell** | 1, 10 | Give the model 2–3 *positive* examples (coded sections + screenshots) of the target quality. Models imitate examples far more reliably than they obey rules |
| P2 | **Lock the free axes before code** | 4 | A ~12-field *direction contract*: display font, text font, palette roles, radius, density, grid, hero type, imagery style, motion signature, section rhythm, voice, one signature moment. Every unfilled field becomes slop |
| P3 | **Constrain the vocabulary** | 1, 5 | Tokens only (no arbitrary values or raw hex), a fixed section kit, an allowlist of fonts and deps. The agent *composes*; it doesn't invent primitives |
| P4 | **Eyes on output, bounded** | 3, 7 | Render 4 viewports → compare with the *target image* → fix the top 3 → stop after 2 rounds |
| P5 | **Content first** | 8 | Real copy and an asset set before layout. Missing content → explicit `TBD`, never decoration |
| P6 | **Decisions as files** | 6 | `decisions.md` with accepted *and rejected* ideas, loaded every session |
| P7 | **Deterministic for mechanics, model for taste** | 9 | Lint, AST and CSS checks per edit; vision judgment once at the end |
| P8 | **Short always-on context** | 9 | ≤ 1.5k tokens always loaded; detail on demand. One rule = one sentence = one check |
| P9 | **Deliberate diversity, human choice** | 2 | Generate 3 *genuinely different* options at once (the verbalized-sampling idea), render them, and let the human pick. No dice |
| P10 | **Reuse before create** | 5 | The codemap's reuse index is checked before any new component or util is written |

---

## 4. Predefined website components

### Two layers
1. **Primitives (behaviour):** Radix UI / React Aria / Base UI, with **shadcn/ui** as the code-owned base. Accessibility and keyboard handling are solved here; never re-implement them.
2. **Sections (composition):** the real unit of website design. This is where slop lives and where our kit should live too.

### The section taxonomy (our kit)

| Section | Variants to ship | Slop version | Good version |
|---|---|---|---|
| **Nav** | inline, centred-logo, minimal + menu sheet | logo + 5 links + gradient button | links match page sections; one clear action; themed focus |
| **Hero** | split copy/visual, full-bleed image, 3D object (Ship4IND), editorial type-only, product screenshot, video | centred headline + subtext + 2 buttons + blob | one focal point that *says* the product; headline ≤ 2 lines on phone |
| **Proof** | logo strip, quote strip, metric line | fake logos, "Trusted by 10,000+" | only real, verifiable proof, or omitted |
| **Features** | alternating media rows, bento, numbered list, tabs | 3 or 6 icon cards | each feature shows evidence (UI crop, image, demo) |
| **Process** | steps with images (Ship4IND), timeline, scroll story | 01/02/03 circles | steps carry real info; numbered only when order matters |
| **Showcase** | gallery, carousel, case study | stock placeholders | art-directed set with one shared style |
| **Testimonials** | single large quote, grid, video | 3 cards with avatars + 5 stars | one strong quote with name and context |
| **Pricing** | 2–3 tiers, calculator/estimate (Ship4IND), comparison table | "Most popular" glow card | the real decision factors; honest caveats |
| **FAQ** | accordion, two-column | generic questions | real objections, near the claims they answer |
| **CTA band** | inline form, single action | gradient band, "Ready to get started?" | specific action, specific outcome |
| **Footer** | sitemap, minimal, big-type | 4 columns of filler links | only real links, legal, contact |
| **Forms** | contact, enquiry modal (Ship4IND), multi-step | no states | loading, error, success, validation |

**Kit rules:** content as data (like Ship4IND `content.ts`) · token-only styling · every section has World-specific variants · responsive rules per variant · all states built · **one signature effect per page**, drawn from a separate, rationed effects library.

### Where to source from

| Source | License | Use |
|---|---|---|
| **shadcn/ui + blocks** | MIT | Base primitives and starting blocks |
| **Magic UI** | MIT (free) | Animated effects, rationed |
| **Aceternity UI** | Free tier + paid ($199 lifetime) | Effects; paid parts can't be redistributed |
| **Origin UI** | Free | Forms, tables, auth, empty states |
| **React Bits** | Free | Text and interaction effects |
| **Tailwind Plus**, **Tailark** | Paid | User's own license only; we can't redistribute |
| **21st.dev** | Marketplace, user's key | Searched through its MCP, filtered by the World |

⚠️ **We must build and own our kit** (MIT-licensed or our own code) to redistribute it. Paid blocks are something the user brings, never something we ship.

---

## 5. Hooks for clean design

Claude Code events and the right check for each. (Mechanics: a PreToolUse hook exiting with code 2 blocks the call and feeds stderr back to the agent; a Stop hook returning `{"decision":"block","reason":…}` makes the agent keep working. Guard with `stop_hook_active` so it can't loop.)

| Event | Trigger | Check | Action | Budget |
|---|---|---|---|---|
| **SessionStart** | always | — | Inject direction contract + codemap summary (≤ 1.5k tokens) | <1s |
| **UserPromptSubmit** | UI task and no direction yet | — | Inject "pick a direction first" (once) | <1s |
| **PreToolUse** Write | new file in `components/`, `lib/` | reuse index: similar name, exports or props? | **Block**: "Use `ui/Select.tsx`" | <1s |
| **PreToolUse** Write/Edit | any UI file | arbitrary values, raw hex outside tokens, fonts not in contract, deps not on allowlist, write into `archive/` or generated files | **Block** with the fix | <1s |
| **PostToolUse** Edit/Write | changed file | `tsc` incremental · ESLint (`tailwindcss/no-arbitrary-value`, `jsx-a11y`, `sonarjs`) · file/function size · jscpd on the file · fast detectors (gradient text, nested cards, icon-card grid, emoji icons, lorem, glow, stock copy) | **Feed back** findings | <3s |
| **Stop** | UI files touched | Playwright 4 viewports · axe · console errors · Lighthouse on hero · knip (dead code) · vision compare with the board | **Block once** with top 3 fixes; max 2 rounds | <60s |
| **SubagentStop** | builder subagent done | same as Stop, scoped | feed back | <60s |

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "deslopify context" }] }],
    "PreToolUse":  [{ "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "deslopify guard", "timeout": 2 }] }],
    "PostToolUse": [{ "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "deslopify check --changed", "timeout": 5 }] }],
    "Stop":        [{ "hooks": [{ "type": "command", "command": "deslopify review", "timeout": 90 }] }]
  }
}
```

**Hook rules for ourselves:** silent when clean · every message names the fix, not just the problem · block only on rules the user turned on (warn otherwise) · one place for ignores, each with a reason.

---

## 6. Tools that already find slop

| Category | Tool | What it catches | Gap |
|---|---|---|---|
| **Design detection** | Impeccable `detect` + hooks | gradient text, glow, contrast, overflow, overused fonts, design-system drift | rule-based; no comparison with a target |
| | 21st.dev **Design Bug Bot** (GitHub App) | inconsistent components, type and spacing vs repo tokens; mobile layout | PR-time only; consistency ≠ quality |
| | axe-core, Lighthouse | a11y, perf | not taste |
| | Playwright snapshots, Chromatic, Argos, Lost Pixel | visual regressions | detects *change*, not *slop*; noisy with WebGL |
| **Design prevention** | Anthropic `frontend-design` skill | ~400-token aesthetic prompt | prompt only, no loop |
| | Mobbin MCP, Refero MCP | real app screens as references | references, not enforcement |
| **Code slop** | **AISlop** CLI + GitHub Action | 0–100 quality score, AI code smells, offline | new, small |
| | **KarpeSlop** | hedging comments, hallucinated imports | narrow |
| | jscpd · knip · dependency-cruiser / madge | duplication · dead code · layering | not wired into agents |
| | ESLint (sonarjs, unicorn, tailwindcss) · TS strict · Semgrep | smells, arbitrary values, custom patterns | need good defaults |
| | SonarQube | broad static analysis | heavy |
| | CodeRabbit, Cursor Bugbot, Greptile | PR review | after the fact; no design |
| **Copy slop** | anti-ai-slop (41 patterns), Slopcheck, Vale (custom rules) | AI prose tells | not tied to UI copy |

**The gaps nobody fills:**
1. Scoring a page **against the design you chose** (not against a checklist).
2. **One score** combining design + code + copy + a11y.
3. **Prevention at write-time** (reuse index, token guard) instead of review afterwards.
4. Hero/UI **copy slop** detection inside the design loop.

---

## 7. Recommendations for DeSlopify

1. **Tiny instruction surface.** One `SKILL.md` ≤ 120 lines plus World files loaded on demand. Always-on context ≤ 1.5k tokens. If a rule needs a paragraph, it's a check, not an instruction.
2. **Examples over rules.** Each World ships coded sections and rendered screenshots at the quality bar. That's the few-shot.
3. **Three rendered options, human picks.** Deliberate diversity (P9), no dice, plus "mix" and "bring a reference".
4. **The 12-field direction contract** is the only design artifact the agent must obey.
5. **Own the section kit.** ~12 sections × World variants, MIT, content-as-data. This is the core asset, more than any prompt.
6. **Write-time guards first** (reuse index, token guard, font/dep allowlist). They prevent slop instead of reviewing it.
7. **SlopScore** = design detectors + code (dup, dead, layering) + copy tells + a11y, as one number plus the top 3 fixes. Built on jscpd, knip, ESLint, axe and Playwright; we write only the missing detectors.
8. **Bounded review loop** against the chosen board: 2 rounds max, before→after shown, thumbs-down written to `decisions.md`.
9. **Steal Impeccable's best ideas:** two-tier hook timing, browser-surface theming, ignores with reasons.
10. **Prove it with SlopBench:** the same 20 prompts, vanilla vs DeSlopify, blind-rated, SlopScore reported. Without that, "less slop" is just our opinion.

---

### Sources
- [Anthropic — Improving frontend design through Skills](https://claude.com/blog/improving-frontend-design-through-skills)
- [Verbalized Sampling (arXiv 2510.01171)](https://arxiv.org/abs/2510.01171)
- [GitClear 2025 AI code quality report](https://www.gitclear.com/ai_assistant_code_quality_2025_research) · [LeadDev coverage](https://leaddev.com/?p=24110)
- [Superdesign — Claude Code UI design](https://www.superdesign.dev/blog/claude-code-ui-design) · [wmedia — frontend-design skill](https://wmedia.es/en/tips/claude-code-frontend-design-skill)
- Impeccable v4.6.0, read from `~/.claude/plugins/cache/impeccable/impeccable/4.6.0/` · [impeccable.style](https://impeccable.style/)
- [21st.dev Design Bug Bot](https://21st.dev/blog/introducing-design-bug-bot) · [21st.dev pricing](https://21st.dev/pricing)
- [Mobbin MCP launch](https://www.wboc.com/online_features/press_releases/mobbin-launches-mcp-server-giving-ai-tools-621-500-real-app-screens-to-reference/article_ffe043e0-a91b-5bb4-9128-21c46942e00c.html) · [Refero MCP](https://www.hunted.space/product/refero/launches/refero-mcp)
- [AISlop](https://runtimewire.com/article/aislop-cli-github-action-ai-code-smells) · [KarpeSlop](https://github.com/CodeDeficient/KarpeSlop) · [Slopcheck](https://rajiv.com/blog/2026/05/31/slop-detection-not-ai-detection/) · [anti-ai-slop](https://aiindigo.com/tool/anti-ai-slop)
- [eslint-plugin-tailwindcss](https://npmjs.com/eslint-plugin-tailwindcss) · [no-arbitrary-value discussion](https://github.com/francoismassart/eslint-plugin-tailwindcss/blob/v3.15.0/docs/rules/no-unnecessary-arbitrary-value.md)
- [Aceternity guide](https://ui.aceternity.com/guides/best-react-ui-components-2026) · [shadcn block libraries](https://adminlte.io/blog/shadcn-ui-block-libraries/) · [Magic UI alternatives](https://designrevision.com/alternatives/magic-ui)
- [Dribbble terms](https://dribbble.com/terms)
