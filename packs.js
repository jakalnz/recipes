// Pack sizes from Shop's items, for recipe lines like "1 can black beans" or "½ packet cream cheese".
// Read-only: nothing here writes to Shop's items. Matches are kept in the Shop household's rxHouseholds doc:
//   packs.{key}:  { id, name, size, g, ml, ok }   ok = confirmed by a person (otherwise an exact name match)
//   packNo.{key}: [itemId, ...]                   items someone said are not this ingredient
import { norm } from './planner.js';

// Shop treats these categories as priced per kg when an item has no unit of its own
const WEIGHED = ['Fruit & Veg', 'Meat & Fish'];
export const perKg = i => i.unit ? i.unit === 'kg' : WEIGHED.includes(i.cat);

// one pack of a Shop item: { g } or { ml }, per single unit of a multipack ("6x375ml" → 375 ml); null if unknown or loose
export function packOf(i){
  if (!i || i.misc || perKg(i)) return null;
  const n = +(String(i.size || '').match(/^\s*(\d+)\s*[x×]/i)?.[1]) || 1;
  if (i.packG > 0) return { g: i.packG / n };
  if (i.packMl > 0) return { ml: i.packMl / n };
  return null;
}

const PACK_WORDS = new Set('can tin canned tinned packet package pack pkt jar bottle tub bag block carton pottle sachet of drained rinsed x'.split(' '));
const words = s => norm(String(s).replace(/\([^)]*\)/g, ' ')).split(' ').filter(w => w && !PACK_WORDS.has(w) && !/^\d/.test(w));
// the name an ingredient is matched and saved under: "Black beans (can)" and "black beans" both give "black bean"
export const packKey = s => words(s).join(' ');

function lev(a, b){
  if (Math.abs(a.length - b.length) > 2) return 9;
  let p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++){
    const c = [i];
    for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
}
// 0 same name … 3 close spelling; 9 no match
function score(key, item){
  const w = words(item.name), n = w.join(' ');
  if (!n) return 9;
  if (n === key || [...w].sort().join(' ') === key.split(' ').sort().join(' ')) return 0;
  if (n.endsWith(' ' + key) || n.startsWith(key + ' ') || key.endsWith(' ' + n)) return 1;   // "Pams black beans", "black beans mexican", "organic chickpeas" → "Chickpeas"
  const kw = key.split(' ');
  if (kw.length > 1 && kw.every(x => w.includes(x))) return 2;
  if (key.length >= 4 && lev(n, key) <= 1) return 3;
  return 9;
}

// The Shop item for an ingredient key.
// { item, sure, confirmed, alts } — sure: same name or confirmed; otherwise the best guess, to be confirmed. null if nothing is close.
export function matchPack(key, items, saved = {}){
  if (!key) return null;
  const live = items.filter(i => !i.misc && !perKg(i));
  const kept = saved.packs?.[key];
  if (kept?.ok){
    const it = live.find(i => i.id === kept.id);
    if (it) return { item: it, sure: true, confirmed: true, alts: [] };
  }
  const no = new Set(saved.packNo?.[key] || []);
  const c = live.filter(i => !no.has(i.id)).map(i => ({ item: i, s: score(key, i) })).filter(x => x.s < 9)
    .sort((a, b) => a.s - b.s || (!!packOf(b.item) - !!packOf(a.item)) || (b.item.count || 0) - (a.item.count || 0));
  if (!c.length) return null;
  return { item: c[0].item, sure: c[0].s === 0, confirmed: false, alts: c.slice(1, 5).map(x => x.item) };
}

// what is saved for a match (and what other households read)
export function entryOf(m, ok){
  const p = packOf(m.item) || {};
  return { id: m.item.id, name: m.item.name, size: m.item.size || '', g: p.g ?? null, ml: p.ml ?? null, ok: !!ok };
}
export const sameEntry = (a, b) => !!a && !!b && ['id', 'name', 'size', 'g', 'ml', 'ok'].every(k => (a[k] ?? null) === (b[k] ?? null));

// "400 g", "375 ml"
export const packText = e => e?.g ? `${Math.round(e.g)} g` : e?.ml ? `${Math.round(e.ml)} ml` : '';
