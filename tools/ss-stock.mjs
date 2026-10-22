// Pulls S&S Activewear data for Threadbreak's order forms.
//  1. Stock + SKUs for the hats on the forms -> snippets/ss-stock.liquid (read by the forms).
//  2. A catalog of styles we carry or might add (colors, SKUs, front/side/back photos)
//     -> tools/ss-catalog.json, used when adding hats/colors. No prices are saved.
// Credentials come from GitHub Actions secrets (SS_ACCOUNT, SS_API_KEY) and are never logged.
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const ACCOUNT = process.env.SS_ACCOUNT, KEY = process.env.SS_API_KEY;
if (!ACCOUNT || !KEY) { console.error("Missing SS_ACCOUNT / SS_API_KEY secrets"); process.exit(1); }
const AUTH = "Basic " + Buffer.from(ACCOUNT + ":" + KEY).toString("base64");
const BASE = "https://api.ssactivewear.com/v2";
const IMG = "https://www.ssactivewear.com/";
const OUT = "snippets/ss-stock.liquid";
const CATALOG_OUT = "tools/ss-catalog.json";

// form style id -> S&S brand + style name candidates (first match wins)
const MAP = {
  rich112:    { brand: "Richardson", styles: ["112"] },
  rich112_5p: { brand: "Richardson", styles: ["112FP"] },
  rich112p:   { brand: "Richardson", styles: ["112PFP", "112P"] },
  rich168:    { brand: "Richardson", styles: ["168"] },
  rich256:    { brand: "Richardson", styles: ["256"] },
  yupoong:    { brand: "YP Classics", styles: ["6006"] },
  yp6606:     { brand: "YP Classics", styles: ["6606"] },
  yp6506:     { brand: "YP Classics", styles: ["6506"] },
  ff110f:     { brand: "Flexfit", styles: ["110F"] },
  ff6277:     { brand: "Flexfit", styles: ["6277"] },
  rich112pm:  { brand: "Richardson", styles: ["112PM"] },
  rich112pl:  { brand: "Richardson", styles: ["112PL"] },
  rich115:    { brand: "Richardson", styles: ["115"] },
  rich258:    { brand: "Richardson", styles: ["258"] },
  rich220:    { brand: "Richardson", styles: ["220"] },
  yp6245:     { brand: "YP Classics", styles: ["6245CM"] },
  yp6089:     { brand: "YP Classics", styles: ["6089M"] },
  yp6789:     { brand: "YP Classics", styles: ["6789M"] },
  ff110m:     { brand: "Flexfit", styles: ["110M"] },
  ff6511:     { brand: "Flexfit", styles: ["6511"] },
};

// extra styles to pull into the catalog (candidates for the forms)
const CATALOG_EXTRA = [
  // add [brand, style] pairs here to pull a style's colors/photos before adding it to the forms
];

const norm = s => String(s || "").toLowerCase().replace(/grey/g, "gray").replace(/[^a-z0-9]/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const big = p => (p ? IMG + String(p).replace(/_fm\.(jpg|png)$/i, "_fl.$1") : null);

async function get(path) {
  const res = await fetch(BASE + path, { headers: { Authorization: AUTH, Accept: "application/json" } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(path.split("?")[0] + " -> HTTP " + res.status);
  return res.json();
}

async function findStyle(brand, candidates) {
  for (const st of candidates) {
    const list = await get("/styles/?search=" + encodeURIComponent(st));
    await sleep(1100);
    const hit = (Array.isArray(list) ? list : []).find(x =>
      norm(x.brandName).startsWith(norm(brand)) && norm(x.styleName) === norm(st));
    if (hit) return hit;
  }
  return null;
}

async function pull(brand, candidates) {
  const style = await findStyle(brand, candidates);
  if (!style) return null;
  const skus = await get("/products/?styleid=" + style.styleID);
  await sleep(1100);
  const colors = {};
  for (const p of skus) {
    const qty = typeof p.qty === "number" ? p.qty
      : (p.warehouses || []).reduce((a, w) => a + (Number(w.qty) || 0), 0);
    const k = norm(p.colorName);
    const c = colors[k] || (colors[k] = {
      name: p.colorName, qty: 0, sizes: {}, skus: {},
      front: big(p.colorFrontImage), side: big(p.colorSideImage || p.colorDirectSideImage), back: big(p.colorBackImage),
      swatch: p.colorSwatchImage ? IMG + p.colorSwatchImage : null,
    });
    c.qty += qty;
    if (p.sizeName) { c.sizes[p.sizeName] = (c.sizes[p.sizeName] || 0) + qty; c.skus[p.sizeName] = p.sku; }
  }
  return { style, colors };
}

const styles = {}, meta = {}, catalog = {};
const remember = (key, r) => {
  catalog[key] = {
    brand: r.style.brandName, style: r.style.styleName, title: r.style.title || "",
    description: String(r.style.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    colors: Object.values(r.colors).map(c => ({ name: c.name, skus: c.skus, sizes: Object.keys(c.sizes), front: c.front, side: c.side, back: c.back, swatch: c.swatch })),
  };
};

for (const [id, m] of Object.entries(MAP)) {
  try {
    const r = await pull(m.brand, m.styles);
    if (!r) { meta[id] = "style not found"; continue; }
    const out = {};
    for (const [k, c] of Object.entries(r.colors)) out[k] = { name: c.name, qty: c.qty, sizes: c.sizes, skus: c.skus };
    styles[id] = out;
    meta[id] = "ok: " + r.style.brandName + " " + r.style.styleName + " (" + Object.keys(out).length + " colors)";
    remember(r.style.brandName + " " + r.style.styleName, r);
  } catch (e) { meta[id] = "error: " + e.message; }
}
const catalogMeta = {};
for (const [brand, st] of CATALOG_EXTRA) {
  try {
    const r = await pull(brand, [st]);
    if (!r) { catalogMeta[brand + " " + st] = "not found"; continue; }
    remember(r.style.brandName + " " + r.style.styleName, r);
    catalogMeta[brand + " " + st] = "ok (" + Object.keys(r.colors).length + " colors)";
  } catch (e) { catalogMeta[brand + " " + st] = "error: " + e.message; }
}

// catalog file: committed alongside the snippet (the workflow commits whatever is staged)
const catalogJson = JSON.stringify({ meta: catalogMeta, styles: catalog }, null, 1);
let oldCatalog = ""; try { oldCatalog = fs.readFileSync(CATALOG_OUT, "utf8"); } catch {}
if (catalogJson !== oldCatalog) {
  fs.writeFileSync(CATALOG_OUT, catalogJson);
  try { execSync("git add " + CATALOG_OUT); } catch {}
}
meta._catalog = crypto.createHash("md5").update(catalogJson).digest("hex").slice(0, 10);

// keep old data for styles that failed this run, so a hiccup never greys everything out
let prev = {};
try { prev = JSON.parse(fs.readFileSync(OUT, "utf8").match(/TB_STOCK = (\{.*\});/s)[1]); } catch {}
for (const id of Object.keys(MAP)) if (!styles[id] && prev.styles && prev.styles[id]) styles[id] = prev.styles[id];

const same = JSON.stringify(prev.styles || {}) === JSON.stringify(styles) && JSON.stringify(prev.meta || {}) === JSON.stringify(meta);
console.log(meta); console.log(catalogMeta);
if (same) { console.log("No stock changes."); process.exit(0); }
const data = { updated: new Date().toISOString(), meta, styles };
fs.writeFileSync(OUT, "{%- comment -%}Auto-generated by tools/ss-stock.mjs. Do not edit.{%- endcomment -%}\n<script>window.TB_STOCK = " + JSON.stringify(data) + ";</script>\n");
console.log("Stock updated.");
