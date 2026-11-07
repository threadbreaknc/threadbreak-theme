// Pulls 10 10 Hats stock from 1010hats.com and writes snippets/tt-stock.liquid.
// The order forms read window.TB_TT_STOCK and grey out any color under the
// threshold set there (TT_MIN in the forms). Run by .github/workflows/tt-stock.yml.
//
// 1010hats.com lists one product per hat color. Each product page carries its
// inventory in `product_inven_array_<id> = { '<variant>': '<qty>' }`. Negative
// numbers mean backordered. We match products to our colors by SKU.
import { writeFileSync } from "node:fs";

const BASE = "https://1010hats.com";
const UA = { "User-Agent": "Mozilla/5.0 (threadbreak stock check; help@threadbreak.com)" };

// SKU -> [style id on our forms, color name on our forms]
const SKU = {
  // 6 Panel
  "616AA-C": ["tt6", "Avalanche Camo"], "616BB": ["tt6", "Black"], "616BO-C": ["tt6", "Blackout Camo"],
  "616DD": ["tt6", "Dark Gray"], "616DB": ["tt6", "Deep Blue"], "616DBW": ["tt6", "Deep Blue/White"],
  "616GT": ["tt6", "Green/Tan"], "616LGB": ["tt6", "Grey/Black"], "616LG": ["tt6", "Light Grey"],
  "616MR": ["tt6", "Maroon"], "616PP": ["tt6", "Pink"], "616RR": ["tt6", "Red"],
  "616SG-C": ["tt6", "Shadow Grass Blades Camo"], "616SB": ["tt6", "Sky Blue"], "616KB": ["tt6", "Tan/Black"],
  "616TN": ["tt6", "True Navy"], "616WW": ["tt6", "White"], "616DG": ["tt6", "Dark Green"],
  // 5 Panel
  "615AA-C": ["tt5", "Avalanche Camo"], "615BB": ["tt5", "Black"], "615BP": ["tt5", "Black Palm"],
  "615BO-C": ["tt5", "Blackout Camo"], "615BFCB": ["tt5", "Bone/Faded Camo Bill"], "615BL-C": ["tt5", "Bottomland Camo"],
  "615DD": ["tt5", "Dark Grey"], "615DB": ["tt5", "Deep Blue"], "615DBW": ["tt5", "Deep Blue/White"],
  "615LGB": ["tt5", "Grey/Black"], "615LG": ["tt5", "Light Grey"], "R615OG": ["tt5", "Offshore Gray"],
  "615ON": ["tt5", "Offshore Navy"], "615PPG": ["tt5", "Pastel Palms"], "615SG-C": ["tt5", "Shadow Grass Blades Camo"],
  "615SB": ["tt5", "Sky Blue"], "615KB": ["tt5", "Tan/Black"], "615TN": ["tt5", "True Navy"],
  "615WW": ["tt5", "White"], "615WR": ["tt5", "White Reef"], "615DG": ["tt5", "Dark Green"],
  "615MR": ["tt5", "Maroon"], "615PP": ["tt5", "Pink"], "615RR": ["tt5", "Red"], "615GT": ["tt5", "Green/Tan"],
  "615BR": ["tt5", "Black Reef"], "615PF": ["tt5", "Pink Flamingo"], "615S": ["tt5", "Seashell"],
  // 5 Panel Rope
  "R615BB-BB": ["tt5r", "Black/Black Rope"], "R615BB": ["tt5r", "Black/White Rope"], "R615DD": ["tt5r", "Dark Grey"],
  "R615DB": ["tt5r", "Deep Blue"], "R615DBW": ["tt5r", "Deep Blue/White"], "R615GT": ["tt5r", "Green/Tan"],
  "R615LGB": ["tt5r", "Grey/Black"], "R615KBB": ["tt5r", "Khaki/Black Bill"], "R615LG": ["tt5r", "Light Grey"],
  "R615MR": ["tt5r", "Maroon"], "R615TN-WW": ["tt5r", "Navy/White Rope"], "R615SB": ["tt5r", "Sky Blue"],
  "R615KB": ["tt5r", "Tan/Black"], "R615TN": ["tt5r", "True Navy"], "R615WW": ["tt5r", "White"],
  "R615WW-GR": ["tt5r", "White/Green Rope"], "R615WW-LB": ["tt5r", "White/Light Blue Rope"],
  "R615WW-RR": ["tt5r", "White/Red & Blue Rope"], "R615WD-C": ["tt5r", "Wild Desert Camo"],
  "R615DG": ["tt5r", "Dark Green"], "R615PP": ["tt5r", "Pink"], "R615R": ["tt5r", "Red"],
  "R615PC-C": ["tt5r", "Coral/Light Blue Rope"], "R615BB-LB": ["tt5r", "Black/Light Blue Rope"],
  "R615-WC-C": ["tt5r", "Wild Current Camo"], "R615-WSF-C": ["tt5r", "Wild Salt Flat Camo"],
  // 7 Panel
  "617AA-C": ["tt7", "Avalanche Camo"], "617BB": ["tt7", "Black"], "617DD": ["tt7", "Dark Grey"],
  "617DB": ["tt7", "Deep Blue"], "617DBW": ["tt7", "Deep Blue/White"], "617GT": ["tt7", "Green/Tan"],
  "617LGB": ["tt7", "Grey/Black"], "617LG": ["tt7", "Light Grey"], "617RR": ["tt7", "Red"],
  "617SB": ["tt7", "Sky Blue"], "617KB": ["tt7", "Tan/Black"], "617TN": ["tt7", "True Navy"],
  "617WW": ["tt7", "White"], "617DG": ["tt7", "Dark Green"]
};

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

const products = [];
for (let page = 1; page < 10; page++){
  const j = await get(`${BASE}/products.json?limit=250&page=${page}`, true);
  if (!j.products || !j.products.length) break;
  products.push(...j.products);
}
const panels = products.filter(p => /^(5|6|7) panel( with rope)?$/i.test(p.title.trim()));

const styles = {}, unmatched = [];
for (const p of panels){
  const sku = (p.variants[0] && p.variants[0].sku || "").trim();
  const hit = SKU[sku];
  if (!hit){ unmatched.push(sku + " (" + p.handle + ")"); continue; }
  const html = await get(`${BASE}/products/${p.handle}`);
  const m = html.match(/product_inven_array_\d+\s*=\s*\{\s*'\d+'\s*:\s*'(-?\d+)'/);
  if (!m) continue;
  const [sid, color] = hit;
  (styles[sid] = styles[sid] || {})[color] = parseInt(m[1], 10);
  await sleep(250);
}

const found = Object.values(styles).reduce((n, s) => n + Object.keys(s).length, 0);
if (found < 40) throw new Error(`Only matched ${found} colors, not writing (site layout may have changed)`);

const data = { updated: new Date().toISOString(), styles };
writeFileSync("snippets/tt-stock.liquid",
  "{%- comment -%}Auto-generated by tools/tt-stock.mjs. Do not edit.{%- endcomment -%}\n" +
  "<script>window.TB_TT_STOCK = " + JSON.stringify(data) + ";</script>\n");
console.log(`Matched ${found} colors.`);
if (unmatched.length) console.log("New on 1010hats.com, not on our forms:\n  " + unmatched.join("\n  "));
