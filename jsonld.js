// Turns schema.org Recipe data (the JSON-LD most recipe sites embed) or an AI reply into a recipe draft.
import { parseIngredients, parseSteps, mapCategories, parseServings } from './paprika.js';

const str = v => v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? v.map(str).filter(Boolean).join(', ') : typeof v === 'object' ? str(v.name || v.text || v['@value'] || '') : String(v);
const decode = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();

// ISO 8601 duration "PT1H20M" → "1 hr 20 min"
export function isoDuration(s){
  const m = String(s || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+S)?)?$/i);
  if (!m) return decode(s);
  const h = (+m[1] || 0) * 24 + (+m[2] || 0), min = Math.round(+m[3] || 0);
  return [h ? `${h} hr` : '', min ? `${min} min` : ''].filter(Boolean).join(' ');
}

// find the Recipe object anywhere in a JSON-LD blob (arrays, @graph, nested mainEntity)
export function findRecipe(ld){
  const seen = new Set(), stack = [ld];
  while (stack.length){
    const o = stack.pop();
    if (!o || typeof o !== 'object' || seen.has(o)) continue;
    seen.add(o);
    const t = o['@type'];
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return o;
    for (const v of Array.isArray(o) ? o : Object.values(o)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}

function steps(instr){
  const out = [];
  const walk = x => {
    if (!x) return;
    if (typeof x === 'string'){
      const lines = x.replace(/<\/(p|li|div|h\d)>|<br\s*\/?>/gi, '\n').split(/\n/).map(decode).filter(Boolean);
      out.push(...parseSteps((lines.length > 1 ? lines : lines.flatMap(l => l.split(/ (?=\d+\. )/))).join('\n\n'))); return;
    }
    if (Array.isArray(x)){ x.forEach(walk); return; }
    if (x['@type'] === 'HowToSection' || x.itemListElement){ if (x.name) out.push(`${decode(x.name)}:`); walk(x.itemListElement); return; }
    const t = decode(x.text || x.name || ''); if (t) out.push(t);
  };
  walk(instr);
  return out.filter(Boolean);
}
const image = img => { const i = Array.isArray(img) ? img[0] : img; return typeof i === 'string' ? i : i?.url || i?.contentUrl || ''; };

// → { title, cats, tags, servings, servingsText, prepTime, cookTime, totalTime, ingredients, steps, notes, source, photoUrl }
export function fromJsonLd(r, url = ''){
  const cats = [].concat(r.recipeCategory || [], r.recipeCuisine || []).flatMap(c => str(c).split(',')).map(s => s.trim()).filter(Boolean);
  const { cats: c2, tags } = mapCategories(cats);
  const { servings, servingsText } = parseServings(str(Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield));
  return {
    title: decode(str(r.name)) || 'Untitled',
    cats: c2, tags, servings, servingsText,
    prepTime: isoDuration(r.prepTime), cookTime: isoDuration(r.cookTime), totalTime: isoDuration(r.totalTime),
    ingredients: parseIngredients((r.recipeIngredient || r.ingredients || []).map(i => decode(str(i))).join('\n')),
    steps: steps(r.recipeInstructions),
    notes: decode(str(r.description)),
    source: { url: url || str(r.url), name: decode(str(r.author || r.publisher || '')) },
    photoUrl: image(r.image),
  };
}

// The AI is asked for this shape (strict JSON schema, so every field is always present).
export const RECIPE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['found', 'title', 'servings', 'prepTime', 'cookTime', 'ingredients', 'steps', 'notes', 'categories', 'sourceName', 'unclear'],
  properties: {
    found: { type: 'boolean', description: 'false if there is no recipe in what was given' },
    title: { type: 'string' },
    servings: { type: 'string', description: 'as written, e.g. "Serves 4-6" or "12 muffins"; empty if not given' },
    prepTime: { type: 'string' }, cookTime: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' }, description: 'one ingredient per item, exactly as written; a group heading as its own item ending in a colon, e.g. "For the sauce:"' },
    steps: { type: 'array', items: { type: 'string' }, description: 'one step per item, as written, without numbering' },
    notes: { type: 'string', description: 'tips, variations or a short description; empty if none' },
    categories: { type: 'array', items: { type: 'string' }, description: 'from: Breakfast, Lunch, Dinner, Baking, Desserts, Snacks, Sides, Salads, Soups, Drinks, Sauces' },
    sourceName: { type: 'string', description: 'book, website or person it came from, if shown' },
    unclear: { type: 'array', items: { type: 'string' }, description: 'words or amounts you could not read with confidence (handwriting, blur); empty if none' },
  },
};
export function fromAi(j, url = ''){
  const { cats, tags } = mapCategories(j.categories || []);
  const { servings, servingsText } = parseServings(j.servings || '');
  return {
    title: String(j.title || '').trim() || 'Untitled', cats, tags, servings, servingsText,
    prepTime: j.prepTime || '', cookTime: j.cookTime || '', totalTime: '',
    ingredients: parseIngredients((j.ingredients || []).join('\n')),
    steps: (j.steps || []).map(s => String(s).replace(/^\s*(step\s*)?\d+[.)]\s*/i, '').trim()).filter(Boolean),
    notes: String(j.notes || '').trim(),
    source: { url, name: j.sourceName || '' },
    unclear: j.unclear || [],
  };
}
// Code that runs on the recipe page itself, in the person's own browser, so sites that block the link reader
// (allrecipes) still work. It builds { recipesImport: 1, url, title, ld, text } and hands it to `finish`,
// a snippet that uses `d`: the browser button opens the app with it; the iPhone Shortcut copies it.
export function pageGrabber(finish){
  return `let r=null;const f=o=>{if(!o||typeof o!='object')return null;const t=o['@type'];if(t==='Recipe'||(Array.isArray(t)&&t.includes('Recipe')))return o;for(const v of Array.isArray(o)?o:Object.values(o)){const x=f(v);if(x)return x}return null};`
    + `for(const s of document.querySelectorAll('script[type="application/ld+json"]')){try{r=f(JSON.parse(s.textContent));if(r)break}catch(e){}}`
    + `if(r){r=Object.assign({},r);['review','comment','aggregateRating','video','interactionStatistic'].forEach(k=>delete r[k])}`
    + `const d={recipesImport:1,url:location.href,title:document.title,ld:r,text:r?'':document.body.innerText.slice(0,30000)};`
    + finish;
}
// text from the clipboard → the page data the Shortcut copied, or null if it's something else
export function parseImport(text){
  const t = String(text || '').trim();
  if (!t.startsWith('{') || !t.includes('recipesImport')) return null;
  try {
    const d = JSON.parse(t);
    if (!d || d.recipesImport !== 1) return null;
    return { url: typeof d.url === 'string' ? d.url : '', title: typeof d.title === 'string' ? d.title : '',
      ld: d.ld && typeof d.ld === 'object' ? d.ld : null, text: typeof d.text === 'string' ? d.text : '' };
  } catch { return null; }
}
// pull a JSON object out of a chatbot reply (```json fences, text around it)
export function parseLooseJson(text){
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error("Couldn't find the recipe in that reply. Paste the whole answer.");
  return JSON.parse(t.slice(a, b + 1));
}
