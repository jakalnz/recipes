// Meal planning helpers: dates, adding up ingredients across planned recipes, and matching them to Shop items.
import { parseLine } from './nutrition.js';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'dessert'];
export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', dessert: 'Dessert' };

/* ---------- dates (local time, weeks start Monday) ---------- */
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const weekStart = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
export const weekDays = start => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export const dayShort = d => d.toLocaleDateString('en-NZ', { weekday: 'short' });
export const dayLong = d => d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' });

/* ---------- Shop's name matching (same rules as Shop's search box) ---------- */
const singular = w => w.length > 3 ? (w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('oes') ? w.slice(0, -2) : (w.endsWith('s') && !w.endsWith('ss')) ? w.slice(0, -1) : w) : w;
export const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map(singular).join(' ');
const sortedKey = s => norm(s).split(' ').sort().join(' ');
function lev(a, b){
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 9;
  let p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++){
    const c = [i];
    for (let j = 1; j <= b.length; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[b.length];
}
// best Shop item for a shopping name, or null. score: 0 exact … 3 close spelling
export function matchShop(name, items){
  const qn = norm(name), qk = sortedKey(name); if (!qn) return null;
  let best = null;
  for (const i of items){
    if (i.misc) continue;
    const n = norm(i.name); let sc = 9;
    if (n === qn || sortedKey(i.name) === qk) sc = 0;
    else if (qn.endsWith(' ' + n)) sc = 1;                                      // "red onion" → "Onion" (but not "garlic powder" → "Garlic")
    else if (n.startsWith(qn + ' ') || n.endsWith(' ' + qn)) sc = 2;           // "Butter" → "Butter salted"
    else if (qn.length >= 4 && lev(n, qn) <= 1) sc = 3;
    if (sc < 9 && (!best || sc < best.score || (sc === best.score && (i.count || 0) > (best.item.count || 0)))) best = { item: i, score: sc };
  }
  return best;
}

/* ---------- turning recipe lines into shopping names ---------- */
const DESCRIBE = new Set(('fresh freshly large small medium big extra ripe very finely roughly thinly chopped diced minced sliced grated shredded crushed ' +
  'peeled cored seeded deseeded halved quartered cubed trimmed drained rinsed packed softened melted room temperature cold warm hot beaten lightly ' +
  'boneless skinless skin-on bone-in good quality organic free range store bought homemade full-fat full fat fat-free lean rindless streaky ' +
  'continental flat-leaf flat leaf baby young about approx plus extra divided separated optional note cooked uncooked raw unsalted salted kosher ' +
  'ground the a an of some few').split(' '));
const RENAME = [[/^(cloves? )?garlic( cloves?)?$/, 'garlic'], [/^eggs?$/, 'eggs'], [/^(plain|all-purpose|standard grade) flour$/, 'plain flour'],
  [/^(white |caster |granulated )?sugar( \(any type\))?$/, 'sugar'], [/^(ground beef|beef mince|minced beef|mince)$/, 'beef mince'],
  [/^(green onions?|scallions?|green shallots?)$/, 'spring onions'], [/^(cilantro|coriander leaves|coriander\/cilantro leaves)$/, 'coriander'],
  [/^(bell pepper|red bell pepper|green bell pepper)s?$/, 'capsicum'], [/^zucchinis?$/, 'courgettes'], [/^(heavy|thickened|whipping|double) cream$/, 'cream'],
  [/^(chicken|beef|vegetable) (stock|broth)$/, '$1 stock']];
export function shopName(text){
  const p = parseLine(text);
  let words = String(p.item).toLowerCase().replace(/[()]/g, ' ').replace(/\b\d+(\.\d+)?\s*(%|cm|mm)\b/g, ' ')
    .replace(/^\s*(small|medium|large|big)\s*(to|or|-|–|\/)\s*(small|medium|large|big)\s+/, '')
    .replace(/^\s*(cans?|tins?|jars?|packets?|packages?|bottles?|bags?|of)\s+(of\s+)?/, '').split(/\s+/).filter(Boolean);
  // keep words that name what you buy: "crushed tomatoes", "diced tomatoes", "ground almonds", "cooked rice"
  const keeps = () => /^(crushed|diced|chopped|whole|sun-dried) tomato|^ground (almond|coriander|cumin|cinnamon|ginger|turmeric|beef|pork|chicken)|^cooked (rice|chicken)|^smoked/.test(words.join(' '));
  while (words.length > 1 && DESCRIBE.has(words[0]) && !keeps()) words.shift();
  while (words.length > 1 && DESCRIBE.has(words[words.length - 1])) words.pop();
  words = words.filter((w, i) => !(DESCRIBE.has(w) && i < words.length - 1 && /^(boneless|skinless|rindless|streaky|lean|unsalted|salted|kosher|fresh|large|small|medium|ripe)$/.test(w)));
  let n = words.join(' ').replace(/\s+(to|for|as)\s.*$/, '').trim();
  for (const [re, to] of RENAME) if (re.test(n)){ n = n.replace(re, to); break; }
  return n ? n[0].toUpperCase() + n.slice(1) : '';
}

/* ---------- pantry staples (left off the list unless asked) ---------- */
export const DEFAULT_PANTRY = ['salt', 'pepper', 'black pepper', 'water', 'oil', 'olive oil', 'vegetable oil', 'canola oil', 'cooking spray', 'ice'];
// a staple matches exactly, or as the last word for salt / pepper / water ("cooking salt", "cold water")
export const isPantry = (name, pantry) => {
  const n = norm(name);
  return (pantry || DEFAULT_PANTRY).some(x => norm(x) === n) || /\b(salt|pepper|water)$/.test(n) && !/\b(bell|chilli|cayenne|coconut)\b/.test(n)
    || CUPBOARD.test(n);
};
// spices, dried herbs and baking basics most kitchens keep: listed under "Usually in the cupboard", unticked
const CUPBOARD = /\b(powder|cumin|paprika|oregano|turmeric|cinnamon|nutmeg|spice|garam masala|baking soda|bicarbonate|bicarb|vanilla|stock cube|bouillon|dried (herb|basil|thyme|oregano|parsley|dill|mint|chilli)|chilli flake|bay leaf|bay leave)\b/;

/* ---------- adding up ---------- */
const UNIT_TEXT = { g: 'g', ml: 'ml', cup: 'cup', tbsp: 'tbsp', tsp: 'tsp', clove: 'clove', can: 'can', packet: 'packet', slice: 'slice', bunch: 'bunch', handful: 'handful', each: '', '': '' };
const round = (v, u) => u === 'g' || u === 'ml' ? (v >= 1000 ? Math.round(v / 50) * 50 : v >= 100 ? Math.round(v / 10) * 10 : Math.round(v)) : Math.round(v * 4) / 4;
const frac = v => { const w = Math.floor(v), f = v - w, F = { .25: '¼', .5: '½', .75: '¾' }[Math.round(f * 4) / 4]; return f < .01 ? String(w) : (w ? w + ' ' : '') + (F || f.toFixed(2)); };
export function amountText(amounts){
  return Object.entries(amounts).filter(([, v]) => v > 0).map(([u, v]) => {
    const r = round(v, u);
    if (u === 'g') return r >= 1000 ? `${Math.round(r / 100) / 10} kg` : `${r} g`;
    if (u === 'ml') return r >= 1000 ? `${Math.round(r / 100) / 10} L` : `${r} ml`;
    const t = UNIT_TEXT[u] ?? u;
    const pl = r > 1 && ['cup', 'clove', 'can', 'packet', 'slice', 'handful'].includes(t) ? 's' : r > 1 && t === 'bunch' ? 'es' : '';
    return `${frac(r)}${t ? ' ' + t + pl : ''}`;
  }).join(' + ');
}
// entries: [{ recipe, servings, label }]  → [{ key, name, amounts, amountText, from:[label], lines:[text], pantry }]
export function shoppingList(entries, { pantry } = {}){
  const by = new Map();
  for (const { recipe, servings, label } of entries){
    if (!recipe) continue;
    const factor = servings && recipe.servings ? servings / recipe.servings : 1;
    for (const ing of recipe.ingredients || []){
      if (ing.heading) continue;
      const p = parseLine(ing.original);
      if (p.optional) continue;
      // "butter or margarine": the first is bought unless you choose the other on the list
      const opts = (p.options || []).length > 1 ? [...new Set(p.options.map(shopName).filter(Boolean))] : [];
      const name = opts[0] || shopName(ing.original); if (!name) continue;
      const key = norm(name);
      const e = by.get(key) || { key, name, amounts: {}, from: [], lines: [], pantry: isPantry(name, pantry) };
      if (opts.length > 1) e.options = [...new Set([...(e.options || []), ...opts])];
      if (p.qty != null){
        let u = p.unit || 'each', q = p.qty * factor;
        if (u === 'kg'){ u = 'g'; q *= 1000; } if (u === 'l'){ u = 'ml'; q *= 1000; }
        e.amounts[u] = (e.amounts[u] || 0) + q;
      }
      if (label && !e.from.includes(label)) e.from.push(label);
      e.lines.push(ing.original);
      by.set(key, e);
    }
  }
  return [...by.values()].map(e => ({ ...e, amountText: amountText(e.amounts) })).sort((a, b) => a.pantry - b.pantry || a.name.localeCompare(b.name));
}

/* ---------- a Shop category for new items ---------- */
// checked in this order: tins and pantry words first, so "crushed tomato" is a tin and "fish sauce" is pantry
const CAT_WORDS = [
  ['Tins & Jars', /\bcan\b|tinned|canned|chickpea|kidney bean|black bean|coconut milk|coconut cream|tomato paste|crushed tomato|diced tomato|chopped tomato|passata|jam|pickle|curry paste|tuna|condensed|evaporated/],
  ['Pantry', /flour|sugar|rice|pasta|noodle|\boats?\b|cocoa|chocolate|baking|vanilla|yeast|spice|cumin|paprika|turmeric|cinnamon|oregano|thyme|stock|\bsoy\b|sauce|vinegar|\boil\b|honey|syrup|(?<!butter)nut|almond|pistachio|raisin|sultana|dried apricot|lentil|semolina|tapioca|breadcrumb|panko|cornflour|seed|mustard|mayonnaise|gelatine|bouillon/],
  ['Frozen', /frozen|\bpeas\b|ice cream/],
  ['Dairy & Eggs', /milk|cream|\bbutter\b|cheese|parmesan|mozzarella|feta|ricotta|yoghurt|yogurt|\beggs?\b/],
  ['Bakery', /bread|pita|wrap|tortilla|\bbuns?\b|\brolls?\b|naan|bagel/],
  ['Meat & Fish', /beef|mince|chicken|pork|lamb|bacon|sausage|steak|fish|salmon|prawn|shrimp|mussel|\bham\b|turkey|drumstick|thigh|breast|fillet|belly|chorizo/],
  ['Fruit & Veg', /onion|garlic|ginger|potato|kumara|carrot|celery|capsicum|courgette|zucchini|tomato|lettuce|cucumber|spinach|broccoli|cabbage|mushroom|avocado|chilli|lemon|lime|banana|apple|berr|mango|orange|herb|coriander|parsley|mint|basil|lemon ?grass|galangal|shallot|leek|pumpkin|butternut|corn|watercress|sprout|kale/],
  ['Drinks', /wine|beer|juice|soda/],
];
export function guessCategory(name, cats){
  const n = String(name).toLowerCase();
  const hit = (CAT_WORDS.find(([, re]) => re.test(n)) || [])[0] || 'Other';
  return !cats || cats.includes(hit) ? hit : (cats.includes('Other') ? 'Other' : cats[0]);
}
