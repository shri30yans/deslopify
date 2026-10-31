# DeSlopify

**You pick a look. Your AI agent builds it well.**

DeSlopify makes Claude Code, Cursor and Codex ship sites that look designed and code that stays clean. The user makes one visual choice and never has to learn a command.

---

## 1. Why the current tools fail (Impeccable and the rest)

We used Impeccable on real work and the results were poor. The reasons are structural:

| Problem | What happens | What we do instead |
|---|---|---|
| **Taste as a list of bans** ("no Inter, no purple gradients, no nested cards") | Avoiding clichés gives you *nothing wrong*, not *something good*. The output is beige and safe | **Show, don't tell.** The agent copies a concrete, complete example (a *World*) instead of dodging a blacklist |
| **Too many commands** (/audit, /polish, /typeset, /overdrive… 18–24 of them) | The user has to know design vocabulary to drive a design tool | **No commands.** One visual choice, then it runs by itself |
| **Text-only** | Words like "editorial" or "bold" mean something different to every model run | Every World ships **real rendered screenshots, tokens, components and asset prompts** |
| **Critique after the fact** | Polishing generic output still leaves you with generic output | The direction is locked **before** the first line of code |
| **Design only** | The page looks fine but the code underneath is a mess of duplicated components | Taste and code guardrails in one install |
| **Nothing to compare against** | "Is it better?" comes down to vibes | The review compares the rendered page **with the board you picked** |

Other parts of the market solve a slice: 21st.dev has components plus a PR design bot, Mobbin and Refero have reference screens over MCP, v0 and Lovable generate apps. **Nobody turns a visual choice into a finished, well-built site inside your own repo.**

---

## 2. The product: three steps, one decision

```
  ① PICK                    ② BUILD                       ③ CHECK
  ────────                  ────────                      ────────
  You describe the          The agent builds as usual.    When the agent finishes,
  product in one line.      DeSlopify quietly feeds it:   DeSlopify renders the page,
  DeSlopify shows 3         • the chosen World            compares it with your board,
  rendered boards made      • matching 21st.dev comps     fixes the top 3 gaps
  for YOUR copy.            • an art-directed asset set   (max 2 rounds), and shows
                            • the codemap / reuse index   you before → after.
  You click one.            and blocks sloppy code.
  (That's the only                                        Thumbs-down any section:
  decision.)                                              it's remembered forever.
```

### ① Pick: Worlds, not rules

A **World** is a complete, coherent design direction, curated and tested:

```
worlds/sky-globe/                ← extracted from Ship4IND
  world.json      tokens: palette, type pair, radii, spacing, motion curve
  grammar.md      layout rules: hero composition, section rhythm, when to use cards
  components.json shortlist of 21st.dev / shadcn components that fit, with props
  assets.json     image prompt kit: palette, lens, light direction, texture, crops
  scene.md        optional 3D recipe (Three.js globe + layered cloud plates)
  refs/           6–10 screenshots of finished pages at the quality bar
```

Starting library: about 12 Worlds (Sky Globe, Swiss Editorial, Dark Instrument, Warm Craft, Soft Brutalist, Product Minimal, Luxury Serif, Playful 3D, Data Dense, Retro Terminal, Organic Gradient, Photo-led Hospitality).

**How the boards get made:** the user's one-liner, plus 3 matching Worlds, is used to generate *real rendered hero sections with the user's own copy* in a headless browser. The user sees their own site three ways, not mood words. They can **mix** ("type from A, colour from B") or **bring a reference** (paste a URL or screenshot they like; we extract its qualities and map it to the nearest World).

### ② Build: invisible guardrails

Everything ships as a Claude Code plugin (later Cursor and Codex): skills, hooks and one MCP server.

- **Direction skill** auto-loads `direction.json` into every UI task, so the agent never re-decides fonts or colours.
- **Component finder:** the MCP tool `find_component(role)` searches the World's shortlist first, then 21st.dev and the shadcn registry, filtered by the World's tokens, then adapts the result to project tokens. No marketplace sameness.
- **Asset director:** generates images *as a matched set* (same palette, lens and light), crops per breakpoint, logs provenance. Ship4IND's sky and cloud plates are the reference example.
- **Code guardrails** (deterministic, fast, silent unless something breaks):

| Principle | Enforced by |
|---|---|
| Single responsibility | file/function size budget; UI can't import `api/` or vendor SDKs |
| Reuse first (rule of three) | before a new component or util is written, the reuse index is checked for near-duplicates |
| Open/closed | duplicate detector flags forked copies of existing components |
| Dependency inversion | vendor SDKs only inside `adapters/` |
| Content ≠ layout | long strings and prices go to `data/` |
| No dead code | unused exports and files are flagged |
| Accessible by default | axe scan, focus, reduced motion |
| Performance budget | heavy 3D/visuals need a fallback and stay within a frame budget |

The **codemap** is a ~150-line tree-sitter map: layers, modules and the reuse index. It's small enough to always sit in context, and it regenerates on commit.

### ③ Check: compare with the board, not a checklist

On stop, if UI changed:
1. Capture 4 viewports (wide, laptop, phone, narrow phone) with Playwright.
2. Run a vision comparison against the chosen board and the World's reference screenshots, scoring hierarchy, spacing, type, colour fidelity and asset cohesion.
3. Auto-fix the **top 3** gaps, re-capture, and stop after 2 rounds. No endless polishing.
4. Show a before → after strip. A thumbs-down on any section writes it to `decisions.md` as **rejected**, so the agent never proposes it again (the Ship4IND airliner lesson).

---

## 3. Inspiration sources: what we can legally use

| Source | Use | How |
|---|---|---|
| **21st.dev** | Component supply | Through its MCP/API with the **user's own 21st key** (Free: unlimited search, 2 installs/day; Builder $6–8/mo: unlimited). Pursue an official partnership or affiliate deal early. It's also a competitor: their *Design Bug Bot* reviews PR UI consistency |
| **shadcn registry, Radix, Magic UI, Aceternity** | Open components | Direct, with license recorded |
| **Mobbin MCP / Refero MCP** | Real product screens for app UI | Optional connectors on the **user's own paid account** |
| **Dribbble** | ⚠️ Human inspiration only | Its terms ban scraping, automated access and derivative works of site content. **We never crawl it.** A user may paste a shot *they* chose as a private reference, and we extract abstract qualities only (palette, type ratio, density), never copy layouts or images. **Better:** recruit Dribbble designers to *author paid Worlds* (see §5) |
| **Awwwards, Godly, Land-book** | Curation signal for our team | We browse by hand to build Worlds; no public APIs to build on |
| **Our own library** | The moat | Worlds we design, render and test ourselves; every ref screenshot is ours |

---

## 4. How we build it

### Architecture

```
┌──────────────────────── user's machine ─────────────────────────┐
│  Claude Code / Cursor / Codex                                   │
│    ├── plugin: skills (direction, assets, 3d-scene, refactor)   │
│    ├── hooks:  pre-write (reuse, size, layers)                  │
│    │           post-edit (typecheck, lint, dup, a11y)           │
│    │           stop      (render → compare → fix ×2)            │
│    └── MCP: deslopify ── find_component · check_reuse ·         │
│                          make_assets · review_page              │
│  deslopify CLI (Node/TS) ── codemap (tree-sitter), checks       │
│  Studio (local web page) ── pick/mix boards, before→after       │
└──────────────┬──────────────────────────────────────────────────┘
               │ (paid features only)
┌──────────────▼────────────── DeSlopify Cloud ───────────────────┐
│  Worlds library + marketplace   Board renderer (headless Chrome)│
│  Image gen proxy (credits)      Vision review                   │
│  GitHub App (PR design + code gate)   Team memory sync          │
└─────────────────────────────────────────────────────────────────┘
```

**Stack:** TypeScript monorepo (pnpm). CLI and MCP in Node. Studio in Vite + React + Tailwind (the Ship4IND stack). Checks wrap proven tools (tree-sitter, jscpd, knip, dependency-cruiser, axe-core, Playwright) rather than reinventing them. Cloud on Vercel/Cloudflare, Postgres for accounts and memory, R2/S3 for boards and assets, Stripe for billing. Models: Claude for reasoning and vision review, an image model (BYO key or our credits) for assets.

**Rule for ourselves:** all project state stays as plain files in the user's repo (`.deslopify/`). Cloud only *computes*; it never holds the source of truth, so there's no lock-in.

### Build plan (2 people, ~12 weeks to paid launch)

| Weeks | Milestone | Done when |
|---|---|---|
| **1–2** | **Sky Globe World + guardrails v0.** Extract Ship4IND into the first World; ship the codemap, reuse check and size/layer hooks as a Claude Code plugin | A fresh "shipping startup" prompt produces a Ship4IND-grade hero without hand-holding |
| **3–4** | **5 more Worlds + Studio picker.** Board renderer: one-liner → 3 rendered heroes with the user's copy | 10 test users pick a board in under 60s and understand it with no docs |
| **5–6** | **Component finder + asset director.** 21st.dev/shadcn search filtered by World; matched image sets + provenance | Generated pages use ≤ 1 off-World component; asset sets pass a contact-sheet review |
| **7–8** | **Check loop.** 4-viewport capture, board comparison, top-3 fix ×2, before→after, rejected-decision memory | Blind raters prefer DeSlopify output ≥ 70% of the time over vanilla Claude Code on 20 prompts (**SlopBench v0**) |
| **9–10** | **Cloud + billing.** Accounts, credits, Stripe, Worlds library gated, image proxy | First paid user |
| **11–12** | **Launch.** Public SlopBench, before/after gallery, Claude plugin marketplace, skills.sh, X/HN/Product Hunt; Cursor adapter | 1k installs, 50 paid |

**After launch:** GitHub App (PR gate), Worlds marketplace, Codex adapter, Next.js/Expo setups, team memory.

### What to build first (this week)
1. Write `worlds/sky-globe/` from Ship4IND's `site-builder` skill, `style.css` tokens, `globe.ts` and hero assets.
2. Write the hooks for reuse check + size budget + layer imports, as a Claude Code plugin.
3. Run 5 prompts with and without it, and screenshot them. That gallery is the pitch.

---

## 5. How we make money

### Pricing

| Plan | Price | For | Includes |
|---|---|---|---|
| **Free** | $0 | Try it, open-source goodwill | CLI + code guardrails + codemap, 3 Worlds, local check loop with your own model keys, 5 boards/mo |
| **Pro** | **$20/mo** ($16 yearly) | Indie builders, freelancers | All Worlds, unlimited board picks, mix + bring-a-reference, 300 asset credits/mo, check loop runs on our models, before→after history |
| **Studio** | **$49/mo** | Agencies (up to 10 client projects) | Everything in Pro + per-client brand Worlds (we build a World from the client's existing brand), white-label review reports to send clients, 1,000 credits |
| **Team** | **$30/seat/mo** | Product teams | GitHub App: design + code gate on every PR, shared decision memory across repos, org-wide principles, quality dashboard |
| **Credits top-up** | $10 / 200 | Heavy asset users | Image generation and extra review rounds |

Anchors: 21st.dev is $6–20, Cursor $20, Lovable $25, Mobbin paid. $20 is a no-brainer next to the tools people already pay for. Studio is the real money: agencies bill clients thousands per site, and "doesn't look AI-made" is worth $49 to them.

### Second revenue line: Worlds marketplace

Designers (including the Dribbble crowd) publish Worlds, made of tokens, grammar, component picks, asset kits and reference renders. **Designer 70% / us 30%.** Pricing $19–79 one-off, or included in Pro with revenue share from a pool by usage.
This solves *taste supply* (the hardest thing to scale), gives designers a new income stream from AI instead of competing with it, and turns Dribbble from a legal problem into a recruiting channel.

### Unit economics (estimates to verify)

| Cost per Pro user/mo | Estimate |
|---|---|
| Board renders (≈ 30 × LLM + headless render) | ~$1.50 |
| Asset credits (300 × ~$0.01–0.04 per image) | ~$3–8 |
| Check loop vision reviews (≈ 60) | ~$2–3 |
| **Total** | **~$7–12 → 40–65% gross margin at $20** |

Guardrails and codemap run locally and cost us nothing. Credits are capped and priced at ~3× cost, so heavy users pay their own way.

### Revenue path

| Milestone | Mix | MRR |
|---|---|---|
| Month 3 | 150 Pro + 20 Studio | ~$4k |
| Month 6 | 600 Pro + 80 Studio + 5 teams × 8 seats | ~$17k |
| Month 12 | 2,000 Pro + 300 Studio + 30 teams × 10 + marketplace | ~$65k+ |

**Go-to-market:** before/after content is the engine. Every demo is a split screen of "vanilla agent" vs "DeSlopify" on the same prompt. Ship4IND is demo #1. Distribution through the Claude Code plugin marketplace, skills.sh, X/YouTube build-in-public, and agency communities.

---

## 6. Competitor map

| Player | What they have | Why we win |
|---|---|---|
| **Impeccable** (OSS) | Anti-pattern rules, 18–24 design commands, detectors | Rules ≠ taste; too many commands; text-only; design only |
| **Anthropic frontend-design** | Short art-direction skill | One prompt, no examples, no loop |
| **21st.dev** | Component marketplace, 21st MCP, 21st AI generation, Design Bug Bot | Components with no direction; bot checks consistency, not quality. **Partner on supply, compete on outcome** |
| **Mobbin MCP / Refero MCP** | Large libraries of real app screens | References, not a build system. We plug them in |
| **v0 / Lovable / Bolt** | Prompt → app | Closed sandboxes, generic look, no existing-repo workflow |
| **Windsurf Codemaps / DeepWiki / Greptile** | Codebase understanding | Built for comprehension; we use the map for *prevention* |
| **CodeRabbit / Cursor Bugbot** | PR code review | After the fact, code only, no design |
| **skills.sh / Agensi / plugin marketplaces** | Distribution | Channels for us, not competitors |

---

## 7. Risks

| Risk | Response |
|---|---|
| Anthropic, Cursor or Vercel ship "design mode" | Our moat is the **Worlds library + designer marketplace + SlopBench data**, which are content and community, not code. Stay agent-agnostic |
| 21st.dev builds this (they're closest) | Move fast on Worlds and the agency tier; or partner. Their DNA is components, ours is direction |
| Worlds make everything look like 12 templates | Mixing + per-client brand Worlds + marketplace growth; every World has range rules, not one layout |
| Taste is subjective | Measure with blind preference (SlopBench), not our opinion |
| Legal risk from references | No scraping; user-supplied refs stay private and abstracted; our refs are our own renders |
| Image costs eat margin | Credit caps, BYO-key option, cache board renders per World |

---

## Open questions
- Name: keep **DeSlopify** (memorable, edgy) or go positive ("Worlds", "Taste")?
- Approach 21st.dev about a partnership before launch, or after we have traction?
- Should Worlds be one-off purchases or a Pro-included pool? (Test both.)
- Second agent after Claude Code: Cursor (bigger) or Codex (same `SKILL.md` format)?
