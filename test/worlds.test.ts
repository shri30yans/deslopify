import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { allowedFonts } from "../src/core/direction.js";
import { fontFaceCss, fontFilePath } from "../src/studio/fonts.js";
import { renderBoard, tokensCss } from "../src/studio/render.js";
import { loadWorlds, rankWorlds } from "../src/studio/worlds.js";

const copy = { brand: "Acme <Co>", headline: "One.\\nTwo.", sub: "A & B", cta: "Go", nav: ["Home"] };

test("every World is a valid direction whose fonts are bundled", () => {
  const worlds = loadWorlds();
  assert.ok(worlds.length >= 4);
  for (const w of worlds) {
    assert.doesNotThrow(() => fontFaceCss(allowedFonts(w.direction)), `${w.id} fonts`);
    assert.ok(w.grammar.length > 100, `${w.id} grammar`);
    assert.ok(w.tags.length >= 8, `${w.id} tags`);
  }
});

test("every board renders the user's copy, escaped, with the tokens", () => {
  for (const w of loadWorlds()) {
    const html = renderBoard(w, copy);
    assert.ok(html.includes("Acme &lt;Co&gt;"), `${w.id} brand`);
    assert.ok(html.includes('<span class="line">One.</span>') && html.includes('<span class="line">Two.</span>'), `${w.id} headline lines`);
    assert.ok(html.includes("A &amp; B") && html.includes("Go"), `${w.id} sub and cta`);
    assert.ok(html.includes(tokensCss(w.direction)), `${w.id} tokens`);
    assert.ok(!html.includes("{{"), `${w.id} leftover placeholder`);
  }
});

test("boards reference only assets that exist", () => {
  for (const w of loadWorlds()) {
    const html = renderBoard(w, copy);
    for (const m of html.matchAll(/\/worlds\/[\w-]+\/assets\/([\w.-]+)/g)) assert.ok(existsSync(join(w.dir, "assets", m[1])), `${w.id}: ${m[1]}`);
  }
});

test("rankWorlds shows the three best matches for the product", () => {
  const worlds = loadWorlds();
  assert.equal(rankWorlds("international shipping and freight delivery", worlds)[0].id, "sky-globe");
  assert.equal(rankWorlds("developer api platform for ai agents", worlds)[0].id, "instrument");
  assert.equal(rankWorlds("a neighbourhood coffee shop and bakery", worlds)[0].id, "craft");
  assert.equal(rankWorlds("a design studio and magazine", worlds)[0].id, "editorial");
  assert.equal(rankWorlds("anything", worlds).length, 3);
});

test("an unbundled font is an error", () => {
  assert.throws(() => fontFaceCss(["Comic Sans"]), /not bundled/);
});

test("every font file a board asks for is vendored", () => {
  for (const w of loadWorlds()) {
    for (const m of fontFaceCss(allowedFonts(w.direction)).matchAll(/\/fonts\/([\w.-]+\.woff2)/g)) {
      const path = fontFilePath(m[1]);
      assert.ok(path && existsSync(path), `${w.id}: ${m[1]}`);
    }
  }
});
