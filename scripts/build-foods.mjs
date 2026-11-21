// Builds the merged food table used for nutrition from three published sources (kept out of git):
//   1. New Zealand FOODfiles 2024 (Plant & Food Research / Ministry of Health)   — preferred
//   2. Australian Food Composition Database Release 3 (FSANZ)                    — second
//   3. USDA FoodData Central SR Legacy (2018)                                    — backstop
// Values are copied unaltered per 100 g (USDA carbohydrate has fibre subtracted, and is labelled as such).
// usage: node scripts/build-foods.mjs  [FOODfiles folder]  → data-src/foods.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const NZ = process.argv[2] || 'C:/New Zealand FOODfiles 2024';
const AF = path.join(ROOT, 'data-src/afcd');
const US = path.join(ROOT, 'data-src/usda');
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const r1 = v => v == null ? null : Math.round(v * 10) / 10;

// food: { id, name, src, n: [carbs, sugars, fibre, fat, satFat, protein, kJ, sodium_mg], d: density g/ml, m: {cup, tbsp, tsp, each} }
const foods = [];

/* ---------- 1. NZ FOODfiles ---------- */
function readTilde(file){
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines[1].split('~');
  return { head, rows: lines.slice(2).map(l => l.split('~')) };
}
{
  const { head, rows } = readTilde(path.join(NZ, 'Principal files/ASCII Text Files/Standard/Standard DATA.AP'));
  const rowsData = rows.slice(1); // second header line holds units
  const col = name => { const i = head.indexOf(name); if (i < 0) throw new Error('FOODfiles column missing: ' + name); return i; };
  const C = { carbW: col('Available carbohydrates by weight'), carbF: col('Available carbohydrate, FSANZ'), sug: col('Sugars, total'), fib: col('Fibre, total dietary'),
    fat: col('Fat, total'), sat: col('Fatty acids, total saturated'), pro: col('Protein, total; calculated from total nitrogen'),
    kj: col('Energy, total metabolisable, available carbohydrate, FSANZ (kJ)'), na: col('Sodium') };
  const csm = readTilde(path.join(NZ, 'Principal files/ASCII Text Files/CSM.FT')).rows;
  const meas = {};
  for (const [id, , label, grams, dens] of csm){
    const m = meas[id] ||= {}; const g = num(grams), L = String(label || '').toLowerCase();
    if (num(dens)) m.d = num(dens);
    if (!g) continue;
    const cupMl = L.match(/^1 cup \((\d+) ml\)/); if (cupMl && !m.cup) m.cup = r1(g * 250 / +cupMl[1]);
    if (/^1 tablespoon/.test(L) && !m.tbsp) m.tbsp = r1(g);
    if (/^1 teaspoon/.test(L) && !m.tsp) m.tsp = r1(g);
    if (/^1 (egg|fruit|medium|whole|piece|clove|stalk|bulb|head|leaf|sausage|chop|fillet|slice|small|large)\b/.test(L) && !m.each) { m.each = r1(g); m.eachLabel = label.trim(); }
  }
  for (const r of rowsData){
    const id = r[0], name = r[1]; if (!id || !name) continue;
    const ms = meas[id] || {};
    foods.push({ id: 'nz:' + id, name, src: 'nz',
      n: [num(r[C.carbW]) ?? num(r[C.carbF]), num(r[C.sug]), num(r[C.fib]), num(r[C.fat]), num(r[C.sat]), num(r[C.pro]), num(r[C.kj]), num(r[C.na])],
      d: ms.d || null, m: { cup: ms.cup, tbsp: ms.tbsp, tsp: ms.tsp, each: ms.each, eachLabel: ms.eachLabel } });
  }
  console.log('FOODfiles foods:', foods.length);
}

/* ---------- 2. AFCD ---------- */
{
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(AF, 'AFCD Release 3 - Nutrient profiles.xlsx'));
  const ws = wb.worksheets.find(w => /per 100 g/i.test(w.name));
  const cell = v => v && typeof v === 'object' ? (v.richText ? v.richText.map(t => t.text).join('') : v.result ?? v.text) : v;
  const head = ws.getRow(3).values.map(v => String(cell(v) ?? '').replace(/\s+/g, ' ').trim());
  const col = re => { const i = head.findIndex(h => re.test(h)); if (i < 0) throw new Error('AFCD column missing: ' + re); return i; };
  const C = { carb: col(/^Available carbohydrate, with sugar alcohols/i), sug: col(/^Total sugars/i), fib: col(/^Total dietary fibre/i),
    fat: col(/^Fat, total/i), sat: col(/^Total saturated fatty acids, equated \(g\)/i), pro: col(/^Protein/i),
    kj: col(/^Energy with dietary fibre, equated/i), na: col(/^Sodium \(Na\)/i), name: col(/^Food Name/i), key: col(/^Public Food Key/i) };
  let n = 0;
  ws.eachRow((row, i) => {
    if (i <= 3) return;
    const v = row.values.map(cell), name = String(v[C.name] ?? '').trim(); if (!name) return;
    foods.push({ id: 'au:' + v[C.key], name, src: 'au',
      n: [num(v[C.carb]), num(v[C.sug]), num(v[C.fib]), num(v[C.fat]), num(v[C.sat]), num(v[C.pro]), num(v[C.kj]), num(v[C.na])], d: null, m: {} });
    n++;
  });
  console.log('AFCD foods:', n);
}

/* ---------- 3. USDA SR Legacy ---------- */
{
  const dir = fs.readdirSync(US, { withFileTypes: true }).find(d => d.isDirectory());
  const base = dir ? path.join(US, dir.name) : US;
  const csv = f => {
    const text = fs.readFileSync(path.join(base, f), 'utf8'); const out = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++){
      const c = text[i];
      if (q){ if (c === '"' && text[i + 1] === '"'){ cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ','){ row.push(cur); cur = ''; }
      else if (c === '\n'){ row.push(cur.replace(/\r$/, '')); out.push(row); row = []; cur = ''; } else cur += c;
    }
    if (cur || row.length){ row.push(cur); out.push(row); }
    const h = out.shift(); return out.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
  };
  const food = csv('food.csv').filter(f => f.data_type === 'sr_legacy_food');
  const SKIP = /baby food|infant formula|fast foods|restaurant|school lunch|^babyfood/i;
  const want = { 1005: 0, 2000: 1, 1079: 2, 1004: 3, 1258: 4, 1003: 5, 1008: 6, 1093: 7 }; // carbs(by difference), sugars, fibre, fat, sat, protein, kcal, sodium
  const vals = {};
  for (const r of csv('food_nutrient.csv')){
    const k = want[r.nutrient_id]; if (k === undefined) continue;
    (vals[r.fdc_id] ||= [])[k] = num(r.amount);
  }
  const ports = {};
  for (const p of csv('food_portion.csv')){
    const g = num(p.gram_weight), a = num(p.amount) || 1, mod = String(p.modifier || p.portion_description || '').toLowerCase(); if (!g) continue;
    const m = ports[p.fdc_id] ||= {};
    if (/^cup\b/.test(mod) && !m.cup) m.cup = r1(g / a * 250 / 236.6);
    else if (/^tbsp\b/.test(mod) && !m.tbsp) m.tbsp = r1(g / a);
    else if (/^tsp\b/.test(mod) && !m.tsp) m.tsp = r1(g / a);
    else if (/^(medium|large|egg|whole|clove|fruit|stalk|piece|breast|thigh|drumstick|slice)\b/.test(mod) && !m.each){ m.each = r1(g / a); m.eachLabel = `1 ${mod}`; }
  }
  let n = 0;
  for (const f of food){
    if (SKIP.test(f.description)) continue;
    const v = vals[f.fdc_id]; if (!v) continue;
    const [carbDiff, sug, fib, fat, sat, pro, kcal, na] = v;
    const avail = carbDiff == null ? null : Math.max(0, carbDiff - (fib || 0)); // fibre subtracted to match NZ/AU "available carbohydrate"
    foods.push({ id: 'us:' + f.fdc_id, name: f.description, src: 'us',
      n: [r1(avail), sug ?? null, fib ?? null, fat ?? null, sat ?? null, pro ?? null, kcal == null ? null : Math.round(kcal * 4.184), na ?? null], d: null, m: ports[f.fdc_id] || {} });
    n++;
  }
  console.log('USDA foods:', n);
}

/* ---------- write ---------- */
for (const f of foods){
  if (!f.d && f.m.cup) f.d = Math.round(f.m.cup / 250 * 100) / 100;  // derive density from a cup weight
  if (f.d) f.d = Math.round(f.d * 100) / 100;
  for (const k of Object.keys(f.m)) if (f.m[k] == null) delete f.m[k];
}
const out = {
  built: new Date().toISOString().slice(0, 10),
  fields: ['carbs', 'sugars', 'fibre', 'fat', 'satFat', 'protein', 'kJ', 'sodium'],
  sources: {
    nz: 'New Zealand FOODfiles 2024 Version 01. © The New Zealand Institute for Plant and Food Research Limited and the Ministry of Health. Available carbohydrate by weight.',
    au: 'Australian Food Composition Database Release 3. © Food Standards Australia New Zealand (CC BY 4.0). Available carbohydrate.',
    us: 'USDA FoodData Central, SR Legacy (2018), public domain. Carbohydrate by difference minus dietary fibre.',
  },
  foods: foods.map(f => [f.id, f.name, f.n, f.d, Object.keys(f.m).length ? f.m : 0]),
};
fs.writeFileSync(path.join(ROOT, 'data-src/foods.json'), JSON.stringify(out));
console.log('total foods:', foods.length, '| size KB:', Math.round(fs.statSync(path.join(ROOT, 'data-src/foods.json')).size / 1024));
