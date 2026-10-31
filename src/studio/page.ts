import { fontFaceCss } from "./fonts.js";
import type { World } from "./worlds.js";

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function card(world: World, index: number): string {
  return `
  <article class="card" style="--i:${index}">
    <div class="stage">
      <img class="desktop" src="/shots/${world.id}/desktop.png" alt="${escapeHtml(world.direction.name)} board on desktop">
      <div class="phone-box"><img class="phone" src="/shots/${world.id}/phone.png" alt="${escapeHtml(world.direction.name)} board on a phone"></div>
    </div>
    <div class="meta">
      <h2>${escapeHtml(world.direction.name)}</h2>
      <p>${escapeHtml(world.blurb)}</p>
      <ul>
        <li>${escapeHtml(world.direction.fonts.display)} + ${escapeHtml(world.direction.fonts.text)}</li>
        <li>${escapeHtml(world.direction.density)} density, ${escapeHtml(world.direction.radius)} corners</li>
      </ul>
      <button data-world="${world.id}">Use this look</button>
    </div>
  </article>`;
}

/** The picker: the user's own copy shown three ways. Choosing one posts to /choose/<id>. */
export function renderStudio(brand: string, worlds: readonly World[]): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Choose a look · DeSlopify</title>
<style>
${fontFaceCss(["Geist"])}
:root{--bg:#0f1012;--panel:#17181b;--ink:#f2f1ee;--muted:#9a9a96;--line:#2a2b2f;--accent:#f2f1ee;--accent-ink:#0f1012}
@media (prefers-color-scheme:light){:root{--bg:#f4f3ef;--panel:#fff;--ink:#16161a;--muted:#6b6b66;--line:#dcdad3;--accent:#16161a;--accent-ink:#f4f3ef}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Geist",system-ui,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
.wrap{max-width:1640px;margin:0 auto;padding:48px clamp(20px,3vw,48px) 64px}
header{display:flex;align-items:baseline;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:36px}
h1{font-size:clamp(28px,3vw,40px);font-weight:600;letter-spacing:-.03em}
header p{color:var(--muted);font-size:16px;max-width:36em;line-height:1.5}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;animation:rise .5s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i)*80ms)}
.stage{display:grid;grid-template-columns:minmax(0,1fr) 22%;gap:12px;padding:12px;background:var(--line)}
.desktop{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;border-radius:8px}
.phone-box{position:relative;border-radius:12px;overflow:hidden}
.phone{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}
.meta{padding:22px 24px 24px;display:flex;flex-direction:column;gap:10px;flex:1}
h2{font-size:21px;font-weight:600;letter-spacing:-.02em}
.meta p{color:var(--muted);font-size:15px;line-height:1.5}
ul{list-style:none;color:var(--muted);font-size:13px;display:flex;flex-direction:column;gap:4px;margin-top:4px}
button{margin-top:auto;font:inherit;font-weight:600;font-size:15px;background:var(--accent);color:var(--accent-ink);border:0;border-radius:10px;padding:14px 18px;cursor:pointer}
button:hover{opacity:.88}
button:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.done{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:var(--bg);text-align:center;padding:24px}
.done.show{display:flex}
.done h2{font-size:34px;margin-bottom:12px}
.done p{color:var(--muted);font-size:17px}
@keyframes rise{from{opacity:0;transform:translateY(14px)}}
@media (max-width:1100px){.grid{grid-template-columns:1fr;max-width:720px;margin:0 auto}}
@media (prefers-reduced-motion:reduce){.card{animation:none}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Choose the look for ${escapeHtml(brand)}</h1>
    <p>Your own words, set three ways. The one you pick becomes the design contract your agent follows.</p>
  </header>
  <main class="grid">${worlds.map(card).join("")}</main>
</div>
<div class="done" id="done"><div><h2>Look chosen</h2><p>Go back to your agent. It has the direction now.</p></div></div>
<script>
document.querySelectorAll("button[data-world]").forEach((button) => {
  button.addEventListener("click", async () => {
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const response = await fetch("/choose/" + button.dataset.world, { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    document.getElementById("done").classList.add("show");
  });
});
</script>
</body>
</html>`;
}
