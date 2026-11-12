// Pulls Atonal stock from atonal.co AND AS Colour stock from ascolour.com, and writes
// both into snippets/atonal-stock.liquid (window.TB_AT_STOCK and window.TB_ASC_STOCK).
// AS Colour lives in this file so the existing workflow picks it up with no changes.
// The order forms read window.TB_AT_STOCK and grey out any color under the
// threshold set there (TT_MIN in the forms). Run by .github/workflows/tt-stock.yml.
//
// Each Atonal product page sets `gsInventoryQty[<variant id>] = <qty>` for every
// color. We match variants to our color names with the table below.
import { writeFileSync, readFileSync } from "node:fs";

const BASE = "https://atonal.co";
const UA = { "User-Agent": "Mozilla/5.0 (threadbreak stock check; help@threadbreak.com)" };

// our style id -> { handle on atonal.co, our color name -> Atonal variant title }
const MAP = {
  atonal: { handle: "a590p-camo-a-frame-snapback", colors: {
    "Natural/Field Camo": "Natural / Field Camo", "Field Camo": "Field Camo", "Black/Field Camo": "Black / Field Camo" } },
  atonal_a500: { handle: "a500", colors: {
    "Black": "Black", "Vintage Black": "Vintage Black", "Ivory": "Ivory", "Navy": "Navy", "Burgundy": "Burgundy",
    "Forest": "Forest", "Chocolate Brown": "Chocolate Brown", "Silver": "Silver", "Copper": "Copper" } },
  atonal_a500c: { handle: "a500c", colors: {
    "Black": "BLACK CORDUROY", "Blush": "BLUSH CORDUROY", "Spruce": "SPRUCE GREEN CORDUROY",
    "Khaki/Black": "KHAKI / BLACK CORDUROY", "Bone/Spruce": "BONE / SPRUCE CORDUROY" } },
  atonal_a500r: { handle: "a500r", colors: {
    "Black": "Black / Black", "Black/White": "BLACK / WHITE", "Black/Red": "BLACK / SCARLET", "Gold/Black": "GOLD / BLACK",
    "Charcoal/Gold": "CHARCOAL / GOLD", "Cardinal/White": "CARDINAL / WHITE", "Sage/White": "SAGE / WHITE",
    "Bone/Medium Blue/Gold": "BONE / MEDIUM BLUE / GOLD", "Bone/Seafoam/Black": "BONE / SEAFOAM / BLACK" } }
};

const norm = t => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, json){
  for (let i = 0; i < 3; i++){
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return json ? r.json() : r.text();
    } catch (e) {}
    await sleep(1500 * (i + 1));
  }
  throw new Error("fetch failed: " + url);
}

// ---------- Atonal ----------
async function pullAtonal(){
  const styles = {}, missing = [];
  let found = 0, expected = 0;
  for (const [sid, cfg] of Object.entries(MAP)){
    const prod = await get(`${BASE}/products/${cfg.handle}.js`, true);
    const html = await get(`${BASE}/products/${cfg.handle}`);
    const qty = {};
    for (const m of html.matchAll(/gsInventoryQty\[(\d+)\]\s*=\s*(-?\d+)/g)) qty[m[1]] = parseInt(m[2], 10);
    const byTitle = {};
    for (const v of prod.variants) byTitle[norm(v.title)] = v;
    styles[sid] = {};
    for (const [ours, theirs] of Object.entries(cfg.colors)){
      expected++;
      const v = byTitle[norm(theirs)];
      if (!v){ missing.push(`${sid}: ${ours} (${theirs})`); styles[sid][ours] = 0; continue; } // gone from Atonal = out of stock
      if (typeof qty[v.id] === "number"){ styles[sid][ours] = qty[v.id]; found++; }
      else if (v.available === false){ styles[sid][ours] = 0; found++; }
    }
    await sleep(300);
  }
  if (found < expected * 0.6) throw new Error(`Atonal: only matched ${found} of ${expected} colors (site layout may have changed)`);
  console.log(`Atonal: matched ${found} of ${expected} colors.`);
  if (missing.length) console.log("No longer on atonal.co (marked out of stock):\n  " + missing.join("\n  "));
  return { updated: new Date().toISOString(), styles };
}

// ---------- AS Colour ----------
// ascolour.com doesn't show quantities, only in stock / out of stock per color, so we
// write 999 (in stock) or 0 (out). The forms grey out anything under 50.
const ASC_BASE = "https://ascolour.com";
const ASC = {
  asc1100: "stock-cap-1100", asc1108: "stock-trucker-cap-1108", asc1150: "class-cap-1150",
  asc1152: "class-cord-cap-1152", asc1130: "access-cap-1130", asc1140: "icon-cap-1140",
  asc1141: "icon-trucker-cap-1141", asc1161: "frame-foam-trucker-cap-1161",
  asc1114: "surf-cap-1114", asc1103: "finn-five-panel-cap-1103"
};
// "Forest green" -> "Forest Green", the way the forms name colors
const titleCase = t => String(t).trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
async function pullAsColour(){
  const styles = {};
  let found = 0, pages = 0;
  for (const [sid, slug] of Object.entries(ASC)){
    const html = await get(`${ASC_BASE}/${slug}/`);
    const pid = (html.match(/name="product_id" value="(\d+)"/) || [])[1];
    if (!pid){ console.log(`AS Colour: no product id on ${slug}`); continue; }
    const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(m => m[0]);
    const attr = (tag, a) => (tag.match(new RegExp(a + '="([^"]*)"')) || [])[1];
    const colors = inputs.filter(t => /aria-label="Colour:/.test(t));
    const colorAttr = colors[0] && attr(colors[0], "name");
    const size = inputs.find(t => /name="attribute\[\d+\]"/.test(t) && attr(t, "name") !== colorAttr && /^\d+$/.test(attr(t, "value") || ""));
    styles[sid] = {};
    for (const c of colors){
      const name = titleCase(attr(c, "aria-label").replace(/^Colour:\s*/, ""));
      let body = `action=add&product_id=${pid}&${encodeURIComponent(attr(c, "name"))}=${attr(c, "value")}&qty%5B%5D=1`;
      if (size) body += `&${encodeURIComponent(attr(size, "name"))}=${attr(size, "value")}`;
      try {
        const r = await fetch(`${ASC_BASE}/remote/v1/product-attributes/${pid}`, { method: "POST",
          headers: { ...UA, "content-type": "application/x-www-form-urlencoded", "x-requested-with": "XMLHttpRequest", "stencil-config": "{}" }, body });
        const j = await r.json();
        if (j && j.data && typeof j.data.instock === "boolean"){ styles[sid][name] = j.data.instock ? 999 : 0; found++; }
      } catch (e) {}
      await sleep(250);
    }
    pages++;
  }
  if (found < 50) throw new Error(`AS Colour: only checked ${found} colors across ${pages} styles (site may have changed)`);
  const out = Object.entries(styles).flatMap(([s, cs]) => Object.entries(cs).filter(([, q]) => !q).map(([c]) => s + ": " + c));
  console.log(`AS Colour: checked ${found} colors.` + (out.length ? " Out of stock:\n  " + out.join("\n  ") : ""));
  return { updated: new Date().toISOString(), styles };
}

// ---------- write (keeps the last good data for a source that failed this run) ----------
const OUT = "snippets/atonal-stock.liquid";
let prev = "";
try { prev = readFileSync(OUT, "utf8"); } catch (e) {}
const keep = name => { const m = prev.match(new RegExp("window\\." + name + " = (\\{.*?\\});</script>")); try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; } };

let at = null, asc = null;
try { at = await pullAtonal(); } catch (e) { console.log(String(e.message || e)); }
try { asc = await pullAsColour(); } catch (e) { console.log(String(e.message || e)); }
if (!at && !asc) throw new Error("Both Atonal and AS Colour failed, not writing");
at = at || keep("TB_AT_STOCK"); asc = asc || keep("TB_ASC_STOCK");

writeFileSync(OUT,
  "{%- comment -%}Auto-generated by tools/atonal-stock.mjs (Atonal + AS Colour). Do not edit.{%- endcomment -%}\n" +
  (at ? "<script>window.TB_AT_STOCK = " + JSON.stringify(at) + ";</script>\n" : "") +
  (asc ? "<script>window.TB_ASC_STOCK = " + JSON.stringify(asc) + ";</script>\n" : ""));
