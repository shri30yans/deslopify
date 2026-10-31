---
name: deslopify
description: Use when building, restyling or extending any website, page or UI component, or when the user asks to set up DeSlopify, pick a look, or fix AI-looking design or code. Chooses the look with the user, then builds to it.
---

# DeSlopify

Hooks already check your code as you work. This skill covers the two things they cannot do for you: choosing a look, and building to it.

## 1. Set up (once per project)

If `.deslopify/config.json` does not exist, run `deslopify init`, then read `.deslopify/codemap.md` and the generated block in `AGENTS.md`.

## 2. Choose the look (before any UI work)

Skip this when the session context shows `## Direction: <name>` already.

1. Collect the real copy: brand name, headline (use `\n` between lines), one-sentence sub, call to action, optional nav labels, and one or two sentences on what the product is and who it is for. Take them from the user's request or the repo. If a fact is unknown, ask; never invent it.
2. Run, in the background, because it waits for the user to click:

   ```
   deslopify pick --brand "…" --headline "Line one.\nLine two." --sub "…" --cta "…" --about "…" [--nav "A,B,C"]
   ```

3. Tell the user the page is open and wait for the command to finish. It prints `Chosen: <look>`.
4. Read `.deslopify/direction.json`, `.deslopify/grammar.md` and `.deslopify/tokens.css`. They are the contract.

`deslopify pick --world <id> …` applies a look without the picker; use it only when the user named the look.

## 3. Build to the contract

- Import the variables in `.deslopify/tokens.css` into the project's own theme; do not hand-pick colours, fonts or radii.
- Follow `grammar.md` for layout. When it conflicts with the user's request, the request wins.
- Reuse what `.deslopify/codemap.md` marks ★. Put code in the layer it names.
- Real copy and real assets only. When something is missing, say so and mark it TBD.

## 4. When a hook speaks

Each message names a rule ID, the line, the fix and why. Fix the cause. Never add `@ts-ignore`, `eslint-disable` or a config ignore to make it quiet. An ignore needs a reason and the user's agreement: it goes in `.deslopify/config.json` under `ignores`.

At the end of a turn the review hook renders the page at four widths and lists screenshots. Open them, compare with `.deslopify/board.png` (the look the user chose), fix the three biggest gaps, then stop.
