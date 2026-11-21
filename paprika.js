// Reads a Paprika export (.paprikarecipes = zip of gzipped JSON, one per recipe) in the browser or Node 18+.
// Returns [{ uid, title, recipe, stars, photo, paprikaCats }] ready to save as rxRecipes.

import { metricRecipe } from './units.js';

export const CATEGORIES =['Breakfast', 'Lunch', 'Dinner', 'Baking', 'Desserts', 'Snacks', 'Sides', 'Salads', 'Soups', 'Drinks', 'Sauces'];

// Paprika category (lower case) → app category and/or tag. Anything else becomes a tag as-is.
const CAT_MAP = {
  dessert: { cat: 'Desserts' }, desserts: { cat: 'Desserts' }, pudding: { cat: 'Desserts' }, puddings: { cat: 'Desserts' },
  baking: { cat: 'Baking' }, cakes: { cat: 'Baking', tag: 'Cakes' }, biscuits: { cat: 'Baking', tag: 'Biscuits' }, bread: { cat: 'Baking', tag: 'Bread' },
  breakfast: { cat: 'Breakfast' }, brunch: { cat: 'Breakfast' }, lunch: { cat: 'Lunch' },
  dinner: { cat: 'Dinner' }, mains: { cat: 'Dinner' }, main: { cat: 'Dinner' }, 'main dish': { cat: 'Dinner' },
  chicken: { cat: 'Dinner', tag: 'Chicken' }, beef: { cat: 'Dinner', tag: 'Beef' }, pork: { cat: 'Dinner', tag: 'Pork' }, lamb: { cat: 'Dinner', tag: 'Lamb' },
  fish: { cat: 'Dinner', tag: 'Fish' }, seafood: { cat: 'Dinner', tag: 'Seafood' }, curry: { cat: 'Dinner', tag: 'Curry' }, beast: { cat: 'Dinner', tag: 'Beast' },
  'quick eats': { tag: 'Quick' }, quick: { tag: 'Quick' }, vegetarian: { tag: 'Vegetarian' }, vegan: { tag: 'Vegan' },
  sides: { cat: 'Sides' }, side: { cat: 'Sides' }, salad: { cat: 'Salads' }, salads: { cat: 'Salads' }, soup: { cat: 'Soups' }, soups: { cat: 'Soups' },
  snacks: { cat: 'Snacks' }, drinks: { cat: 'Drinks' }, sauces: { cat: 'Sauces' }, seasoning: { cat: 'Sauces', tag: 'Seasoning' },
  mum: { tag: "Mum's" },
};
export function mapCategories(names){
  const cats = new Set(), tags = new Set();
  for (const raw of names || []){
    const n = String(raw).trim(); if (!n) continue;
    const m = CAT_MAP[n.toLowerCase()];
    const direct = CATEGORIES.find(c => c.toLowerCase() === n.toLowerCase());
    if (m){ if (m.cat) cats.add(m.cat); if (m.tag) tags.add(m.tag); }
    else if (direct) cats.add(direct);
    else tags.add(n);
  }
  return { cats: [...cats], tags: [...tags] };
}

// Used only when a recipe has no category at all.
const GUESS = [
  [/pancake|waffle|porridge|granola|omelette|french toast/i, 'Breakfast'],
  [/muffin|scone|bread|loaf cake|biscuit|cookie|slice|brownie|cake/i, 'Baking'],
  [/pudding|mousse|cheesecake|souffl|tart tatin|ice cream|crumble|pavlova|trifle/i, 'Desserts'],
  [/salad/i, 'Salads'], [/soup|chowder/i, 'Soups'],
  [/chicken|beef|pork|lamb|mince|curry|stroganoff|casserole|meatloaf|chilli con|stir fry|fish|pitas|arayes|tart|goulash|gulash/i, 'Dinner'],
  [/seasoning|sauce|dressing|marinade|spice mix/i, 'Sauces'],
  [/fritter|aloo|potato|chaat/i, 'Sides'],
];
export const guessCategory = title => (GUESS.find(([re]) => re.test(title)) || [])[1] || '';

const clean = s =>String(s ?? '').replace(/\r/g, '').trim();
export function parseServings(s){
  const t = clean(s), m = t.match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
  return { servings: m ? +m[1] : null, servingsText: t };
}
export function parseTime(s){
  const t = clean(s); if (!t) return '';
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm){ const h = +hm[1], m = +hm[2]; return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || ''; }
  return t;
}
// Button text some websites leave in scraped ingredient lists.
const JUNK = /^(select all( ingredients)?|deselect all|add (all )?(ingredients )?to (my )?(shopping )?list|print( recipe)?|jump to recipe|us customary|metric|imperial|ingredients|(\d+\s*x\s*)+)$/i;
export function parseIngredients(s){
  return clean(s).split('\n').map(x => x.trim()).filter(x => x && !JUNK.test(x)).map(original => {
    const heading = /:\s*$/.test(original) || /^[A-Z][A-Z &'-]{3,}$/.test(original) || /^(other |the )?ingredients (for|to)\b.*$|^other ingredients$/i.test(original);
    return heading ? { original: original.replace(/:\s*$/, ''), heading: true } : { original };
  });
}
export function parseSteps(s){
  const t = clean(s); if (!t) return [];
  const blocks = /\n\s*\n/.test(t) ? t.split(/\n\s*\n/) : t.split('\n');
  return blocks.map(b => b.replace(/\s*\n\s*/g, ' ').replace(/^\s*(step\s*)?\d+[.)]\s*/i, '').trim()).filter(Boolean);
}
// "Fat: 42.6 grams fat" → { fat: 42.6, ... } (as the website gave it; per-serving basis unknown)
const NUT_KEYS = { calories: 'kcal', fat: 'fat', 'saturated fat': 'satFat', carbohydrate: 'carbs', carbohydrates: 'carbs', sugar: 'sugar', sugars: 'sugar',
  fiber: 'fibre', fibre: 'fibre', protein: 'protein', sodium: 'sodium', cholesterol: 'cholesterol' };
export function parseNutrition(s){
  const out = {};
  for (const line of clean(s).split('\n')){
    const m = line.match(/^\s*([a-z ]+?)\s*:\s*([\d.]+)/i); if (!m) continue;
    const k = NUT_KEYS[m[1].toLowerCase()]; if (k) out[k] = +m[2];
  }
  return Object.keys(out).length ? out : null;
}

export function mapRecipe(p){
  const { cats, tags } = mapCategories(p.categories);
  const guessed = !cats.length && guessCategory(clean(p.name));
  if (guessed) cats.push(guessed);
  const { servings, servingsText } = parseServings(p.servings);
  const nut = parseNutrition(p.nutritional_info);
  const notes = [clean(p.description), clean(p.notes)].filter(Boolean).join('\n\n');
  const recipe = {
    title: clean(p.name) || 'Untitled',
    cats, tags, servings, servingsText,
    prepTime: parseTime(p.prep_time), cookTime: parseTime(p.cook_time), totalTime: parseTime(p.total_time),
    ingredients: parseIngredients(p.ingredients),
    steps: parseSteps(p.directions),
    notes,
    source: { url: clean(p.source_url), name: clean(p.source), paprikaUid: p.uid || '' },
    imported: { from: 'Paprika', created: clean(p.created) },
  };
  if (nut) recipe.nutrition = { website: nut, method: 'website', checked: false };
  Object.assign(recipe, metricRecipe(recipe));   // metric, keeping the original lines in `was` / `stepsWas`
  const stars = p.rating >= 1 && p.rating <= 5 ? Math.round(p.rating) : 0;
  const photo = p.photo_data && p.photo_data.length < 900000 ? `data:image/jpeg;base64,${p.photo_data}` : null;
  return { uid: p.uid || '', title: recipe.title, recipe, stars, photo, guessed: !!guessed, paprikaCats: (p.categories || []).map(c => String(c).trim()) };
}

// ---- zip + gzip ----
async function inflate(bytes, format){
  const ds = new DecompressionStream(format);
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
export async function unzip(buffer){
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = b.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("This doesn't look like a Paprika export (no zip directory found).");
  const count = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true);
  const files = [];
  for (let i = 0; i < count; i++){
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged zip file.');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), lho = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
    const data = b.subarray(start, start + csize);
    files.push({ name, data: method === 8 ? await inflate(data, 'deflate-raw') : method === 0 ? data : null });
  }
  return files;
}
export async function readPaprika(buffer){
  const files = await unzip(buffer), out = [], skipped = [];
  for (const f of files){
    if (!f.data || f.name.endsWith('/')) continue;
    try {
      let bytes = f.data;
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await inflate(bytes, 'gzip');
      out.push(mapRecipe(JSON.parse(new TextDecoder().decode(bytes))));
    } catch (e){ skipped.push(f.name); }
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  return { recipes: out, skipped };
}
