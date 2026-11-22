// Metric conversion for recipe text. NZ kitchen units: g, kg, ml, L, °C, cm, plus cups / tbsp / tsp.
// Never shows ounces, pounds or °F. Where a line already gives both (e.g. "1 lb / 500g"), the metric is kept as written.

const FRAC = { '½': .5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': .25, '¾': .75, '⅕': .2, '⅖': .4, '⅗': .6, '⅘': .8, '⅙': 1 / 6, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
const UF = Object.keys(FRAC).join('');
// a quantity: 1, 1.5, 1/2, 1 1/2, ½, 1½, 1 ½
const N = `(?:\\d+(?:\\.\\d+)?\\s*[${UF}]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${UF}])`;
export function num(s){
  s = String(s).trim();
  let m;
  if ((m = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)?\\s*([${UF}])$`)))) return (+m[1] || 0) + FRAC[m[2]];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  return parseFloat(s);
}

const G_PER = { oz: 28.3495, lb: 453.592 };
// 8 oz → 225 g, 12 oz → 340 g, 1 lb → 450 g, 1½ lb → 675 g, 2 lb → 900 g
const roundG = g => g < 400 ? Math.max(5, Math.round(g / 5) * 5) : Math.round(g / 25) * 25;
export function grams(g){
  if (g >= 1000){ const kg = Math.round(g / 100) / 10; return `${kg} kg`; }
  return `${roundG(g)} g`;
}
const ml = v => v >= 1000 ? `${Math.round(v / 100) / 10} L` : `${v < 100 ? Math.round(v / 5) * 5 : Math.round(v / 25) * 25} ml`;
// Standard can and tin sizes, so "15 oz can" reads "1 can (400 g)"
export function canGrams(oz){
  const table = [[5, 140], [6, 170], [6.5, 185], [8, 225], [10.75, 300], [12, 340], [13.5, 400], [15.5, 400], [20, 540], [29, 800]];
  for (const [max, g] of table) if (oz <= max) return g;
  return roundG(oz * G_PER.oz);
}
// Oven temperatures as NZ recipes write them
const OVEN = { 250: 120, 275: 140, 300: 150, 325: 160, 350: 180, 375: 190, 400: 200, 425: 220, 450: 230, 475: 240, 500: 260 };
export function fToC(f){
  if (OVEN[f]) return OVEN[f];
  const c = (f - 32) * 5 / 9;
  return c >= 100 ? Math.round(c / 5) * 5 : Math.round(c);
}

const OZ = `(?:oz\\.?|ounces?)`, LB = `(?:lbs?\\.?|pounds?)`, IMPU = `(?:${LB}|${OZ})`;
const MET = `${N}\\s*(?:kg|g|grams?|ml|L|litres?|liters?)\\b`;
const IMP = `${N}\\s*-?\\s*${IMPU}(?![a-z])`;
const toG = (q, unit) => num(q) * (/^(lb|pound)/i.test(unit) ? G_PER.lb : G_PER.oz);
const CONTAINER = `(cans?|tins?|packages?|packets?|pkts?|jars?|bags?|boxes|box|bottles?|cartons?|blocks?|tubs?)`;
const isCan = w => /^(can|tin)/i.test(w);
const plural = (w, n) => n > 1 && !/s$/i.test(w) ? (/x$/.test(w) ? w + 'es' : w + 's') : n <= 1 ? w.replace(/(?<=box)es$|(?<=[^s])s$/i, '') : w;

// Convert one ingredient line (or any text) to metric.
export function toMetric(text){
  let s = String(text ?? '');
  if (!s.trim()) return s;

  // 1. Both given: keep the metric, drop the imperial. "1 lb / 500g", "500g/1lb", "11 ounces (310g)", "(~55g/2 oz each)"
  s = s.replace(new RegExp(`(${IMP})\\s*\\/\\s*(~?${MET})`, 'gi'), '$2')
       .replace(new RegExp(`(~?${MET})\\s*\\/\\s*(${IMP})`, 'gi'), '$1')
       .replace(new RegExp(`(${IMP})\\s*\\(\\s*~?(${MET})\\s*\\)`, 'gi'), '$2')
       .replace(new RegExp(`(${MET})\\s*\\(\\s*~?(${IMP})\\s*\\)`, 'gi'), '$1');
  // "1 lb skin-on chicken thigh (455 g)" → "455 g skin-on chicken thigh"
  const lonelyMet = s.match(new RegExp(`\\(\\s*~?(${MET})\\s*\\)`, 'i'));
  if (lonelyMet && new RegExp(IMP, 'i').test(s)) s = s.replace(new RegExp(IMP, 'i'), lonelyMet[1]).replace(lonelyMet[0], '').replace(/\s{2,}/g, ' ').trim();

  // 2. Cans and packages: "2 (6 ounce) cans tuna" → "2 cans (170 g each) tuna"; "1 (12 ounce) package" → "1 (340 g) package"
  s = s.replace(new RegExp(`(${N})\\s*\\(\\s*(${N})\\s*-?\\s*(${IMPU})\\s*\\)\\s*${CONTAINER}`, 'gi'), (m, cnt, q, u, w) => {
    const n = num(cnt), g = toG(q, u);
    if (isCan(w)) return `${cnt} ${plural(w, n)} (${canGrams(g / G_PER.oz)} g${n > 1 ? ' each' : ''})`;
    return `${cnt} (${grams(g)}) ${w}`;
  });
  // "1 can (14 oz) coconut milk" → "1 can (400 g) coconut milk"
  s = s.replace(new RegExp(`(${N})\\s*${CONTAINER}\\s*\\(\\s*(${N})\\s*-?\\s*(${IMPU})\\s*\\)`, 'gi'), (m, cnt, w, q, u) => {
    const g = toG(q, u), n = num(cnt);
    return isCan(w) ? `${cnt} ${w} (${canGrams(g / G_PER.oz)} g${n > 1 ? ' each' : ''})` : `${cnt} ${w} (${grams(g)})`;
  });
  // "15 oz can black beans" → "1 can (400 g) black beans"
  s = s.replace(new RegExp(`(?<![\\d(])(${N})\\s*-?\\s*(${IMPU})\\s+(cans?|tins?)\\b`, 'gi'), (m, q, u, w) => `1 ${w.replace(/s$/i, '')} (${canGrams(toG(q, u) / G_PER.oz)} g)`);

  // 3. Fluid ounces, pints, quarts → ml / L
  s = s.replace(new RegExp(`(${N})\\s*(?:fl\\.?\\s*oz\\.?|fluid\\s+ounces?)`, 'gi'), (m, q) => ml(num(q) * 29.5735))
       .replace(new RegExp(`(${N})\\s*(?:pints?|pt)\\b`, 'gi'), (m, q) => ml(num(q) * 473.176))
       .replace(new RegExp(`(${N})\\s*(?:quarts?|qt)\\b`, 'gi'), (m, q) => ml(num(q) * 946.353))
       .replace(new RegExp(`(${N})\\s*gallons?\\b`, 'gi'), (m, q) => ml(num(q) * 3785.41));

  // 4. Sticks of butter
  s = s.replace(new RegExp(`(${N})\\s*sticks?\\s+(?:of\\s+)?((?:unsalted\\s+|salted\\s+)?butter)`, 'gi'), (m, q, b) => `${grams(num(q) * 113.4)} ${b}`);

  // 5. Remaining pounds and ounces → g / kg (ranges too: "1-2 lb")
  s = s.replace(new RegExp(`(${N})\\s*[-–]\\s*(${N})\\s*(${IMPU})(?![a-z])`, 'gi'), (m, a, b, u) => {
    const ga = toG(a, u), gb = toG(b, u);
    return gb >= 1000 ? `${Math.round(ga / 100) / 10}–${Math.round(gb / 100) / 10} kg` : `${roundG(ga)}–${roundG(gb)} g`;
  });
  s = s.replace(new RegExp(`(${N})\\s*-?\\s*(${IMPU})(?![a-z])`, 'gi'), (m, q, u) => grams(toG(q, u)));

  // 6. Inches → cm. Both given ("23cm/9"", "1cm / 4/5"") keeps the cm. Then "1-inch", "1 inch", '9"', "9x13 inch"
  const INCH = `(?:inch(?:es)?\\b|in\\.|")`;
  s = s.replace(new RegExp(`(${N}\\s*(?:cm|mm)\\b)\\s*\\/\\s*${N}\\s*-?\\s*${INCH}`, 'gi'), '$1')
       .replace(new RegExp(`${N}\\s*-?\\s*${INCH}\\s*\\/\\s*(${N}\\s*(?:cm|mm)\\b)`, 'gi'), '$1');
  s = s.replace(/(\d+)\s*[x×]\s*(\d+)\s*-?\s*(?:inch(?:es)?|in\.|")/gi, (m, a, b) => `${cm(+a)} x ${cm(+b)} cm`);
  s = s.replace(new RegExp(`(${N})\\s*-?\\s*(?:inch(?:es)?\\b|in\\.|")`, 'gi'), (m, q) => `${cm(num(q))} cm`);

  s = article(convertTemps(s)).replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([,)])/g, '$1').trim();
  // Only report a change when a unit actually changed, not just spacing or a ° sign.
  const same = x => String(x).replace(/[\s°]/g, '');
  return same(s) === same(text) ? String(text) : s;
}
// half centimetres for small things (ginger, thickness), whole cm for tins and dishes (8 inch → 20 cm)
const cm = inch => { const v = inch * 2.54; return v < 10 ? Math.max(0.5, Math.round(v * 2) / 2) : Math.round(v); };
// "an 20 cm tin" → "a 20 cm tin", "a 8 cm" → "an 8 cm"
const article = s => s.replace(/\b([Aa])n? (?=(\d[\d.]*))/g, (m, a, n) => (/^(8|11|18)(\D|$)|^8\d/.test(n) ? a + 'n ' : a + ' '));

// °F → °C in method text. Keeps the Celsius where both are given.
export function convertTemps(text){
  const D = `\\s*(?:°|º|degrees?|deg\\.?)?\\s*`;
  return String(text ?? '')
    // "180C/350F", "68C / 155F", "180°C (350°F)"
    .replace(new RegExp(`(\\d+)${D}C\\b\\s*\\(\\s*(\\d+)${D}(?:F|Fahrenheit)\\b\\s*\\)`, 'gi'), '$1°C')
    .replace(new RegExp(`(\\d+)${D}C\\b\\s*(?:\\/|or)\\s*(\\d+)${D}(?:F|Fahrenheit)\\b`, 'gi'), '$1°C')
    // "350 degrees F (175 degrees C)", "200F/100C"
    .replace(new RegExp(`(\\d+)${D}(?:F|Fahrenheit)\\b\\s*\\(\\s*(\\d+)${D}C(?:elsius)?\\b\\s*\\)`, 'gi'), '$2°C')
    .replace(new RegExp(`(\\d+)${D}(?:F|Fahrenheit)\\b\\s*(?:\\/|or)\\s*(\\d+)${D}C(?:elsius)?\\b`, 'gi'), '$2°C')
    // lone Fahrenheit: "400°F", "375 degrees F", "350F", "325 F"
    .replace(new RegExp(`(\\d+)\\s*(?:°|º)\\s*F\\b|(\\d+)\\s*degrees?\\s*(?:F\\b|Fahrenheit)|(\\d+)F\\b|(\\d{3})\\s+F\\b`, 'gi'), (m, a, b, c, d) => `${fToC(+(a || b || c || d))}°C`)
    // tidy "180C" / "180 degrees C" → "180°C"
    .replace(/(\d+)\s*(?:degrees?\s*C(?:elsius)?\b|º\s*C\b|C\b(?=[\s.,;)]|$))/g, (m, a) => /^\d+\s*C$/.test(m) && +a < 30 ? m : `${a}°C`);
}

/* ---------- scaling a recipe: ½×, 2×, 3× ---------- */
// 1.5 → "1½", 0.33 → "⅓", 2.1 → "2"; to the nearest kitchen fraction
const NICE = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];
export function niceQty(v){
  if (v > 0 && v < 0.1) return String(Math.round(v * 100) / 100);
  let w = Math.floor(v), f = v - w;
  const [x, s] = NICE.reduce((b, c) => Math.abs(c[0] - f) < Math.abs(b[0] - f) ? c : b);
  if (x === 1) w += 1;
  if (w >= 10 && s) return String(Math.round(v));   // "12½ eggs" is silly; "12" will do
  return w ? `${w}${s}` : s || '0';
}
const roundMetric = v => v < 20 ? Math.round(v * 2) / 2 : v < 400 ? Math.round(v / 5) * 5 : Math.round(v / 25) * 25;
const dp1 = v => String(Math.round(v * 100) / 100);
// words after a number that change between one and several
const COUNT = ['cup', 'can', 'tin', 'clove', 'egg', 'slice', 'sheet', 'packet', 'jar', 'bag', 'tub', 'sprig', 'stalk', 'stick', 'handful', 'rasher', 'fillet',
  'breast', 'thigh', 'drumstick', 'onion', 'carrot', 'lemon', 'lime', 'apple', 'banana', 'courgette', 'zucchini', 'capsicum', 'chilli', 'sausage', 'block', 'bottle', 'carton'];
const COUNT_ES = { bunch: 'bunches', pinch: 'pinches', potato: 'potatoes', tomato: 'tomatoes', box: 'boxes', dash: 'dashes' };
function countWord(w, n){
  const lw = w.toLowerCase();
  const one = COUNT_ES[lw] ? lw : Object.entries(COUNT_ES).find(([, p]) => p === lw)?.[0] || (COUNT.includes(lw.replace(/s$/, '')) ? lw.replace(/s$/, '') : null);
  if (!one) return w;
  const out = n > 1 ? COUNT_ES[one] || one + 's' : one;
  return w[0] === w[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
}
// one amount with its unit: "1½ cup" ×2 → "3 cups", "600 g" ×2 → "1.2 kg"
function scaleAmount(q, unit, k){
  const v = q * k, u = (unit || '').toLowerCase().replace(/\.$/, '');
  if (/^(g|grams?)$/.test(u)) return v >= 1000 ? `${dp1(v / 1000)} kg` : `${roundMetric(v)} ${unit}`;
  if (/^(ml|millilitres?|milliliters?)$/.test(u)) return v >= 1000 ? `${dp1(v / 1000)} L` : `${roundMetric(v)} ${unit}`;
  // lots of spoons read better as bigger measures (NZ: 5 ml tsp, 15 ml tbsp, 250 ml cup)
  if (/^(tsp|teaspoons?)$/.test(u) && v >= 6) return scaleAmount(v / 3, 'tbsp', 1);
  if (/^(tbsp|tablespoons?)$/.test(u) && v >= 8) return scaleAmount(v * 15 / 250, 'cups', 1);
  if (/^(kg|l|litres?|liters?)$/.test(u)) return v < 1 ? `${roundMetric(v * 1000)} ${u === 'kg' ? 'g' : 'ml'}` : `${dp1(v)} ${unit}`;
  return `${niceQty(v)}${unit ? ' ' + countWord(unit, v) : ''}`;
}
// Scale the amount at the start of an ingredient line ("2-3 cloves", "Juice of 1 lemon",
// "125 ml / ½ cup milk"). A size per can or packet in brackets stays as it is: "1 can (400 g)" ×2 → "2 cans (400 g)".
export function scaleLine(text, k){
  const s = String(text ?? '');
  if (!k || k === 1) return s;
  const AMT = `(${N})(?:\\s*(?:-|–|to)\\s*(${N}))?((\\s*)([a-zA-Z]+\\.?)(?![a-zA-Z]))?`;
  const m = s.match(new RegExp(`^(\\s*(?:[a-zA-Z][a-zA-Z ,]*?\\bof\\s+)?)${AMT}`));
  if (!m) return s;
  const word = m[6] || '';
  // the word is a unit when it's a measure or a counted thing ("2 cans"); otherwise it stays in the rest ("2 large eggs")
  const isUnit = !!word && (/^(g|grams?|kg|ml|l|litres?|liters?|cups?|tbsp|tsp|tablespoons?|teaspoons?|x)\.?$/i.test(word) || countWord(word, 2) !== word || countWord(word, 1) !== word);
  const unit = isUnit ? word : '';
  const hi = m[3] != null ? scaleAmount(num(m[3]), unit, k) : null;
  const head = hi ? `${scaleAmount(num(m[2]), unit, k).replace(/\s.*$/, '')}–${hi}` : scaleAmount(num(m[2]), unit, k);
  let rest = s.slice(m[0].length - (isUnit ? 0 : (m[4] || '').length));
  // a second measure of the same thing: "125 ml / ½ cup milk"
  const alt = rest.match(/^(\s*\/\s*)/);
  if (alt && new RegExp(`^${N}`).test(rest.slice(alt[1].length))) rest = alt[1] + scaleLine(rest.slice(alt[1].length), k);
  return m[1] + head + rest;
}

// Convert a recipe's ingredients and steps; returns the changed fields (originals kept in `was`).
export function metricRecipe(r){
  let changed = false;
  const ingredients = (r.ingredients || []).map(i => {
    if (i.heading) return i;
    const src = i.was ?? i.original, out = toMetric(src);
    if (out !== src){ changed = true; return { ...i, original: out, was: src }; }
    return i;
  });
  const srcSteps = r.stepsWas || r.steps || [];
  const steps = srcSteps.map(s => toMetric(s));
  const stepsChanged = steps.some((s, k) => s !== srcSteps[k]);
  if (stepsChanged) changed = true;
  return changed ? { ingredients, steps, ...(stepsChanged ? { stepsWas: srcSteps } : {}), units: 1 } : { units: 1 };
}
