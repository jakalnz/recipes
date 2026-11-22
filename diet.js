// Dietary presets and the ingredient checker.
import { parseLine } from './nutrition.js';
// Keyword matching only — it flags things to look at, it is not medical advice.

export const LEVELS = {
  allergy: { label: 'Allergy: must avoid', short: 'allergy', rank: 0 },
  avoid:   { label: "Doesn't eat",        short: "doesn't eat", rank: 1 },
  upset:   { label: 'Upsets me',          short: 'upsets', rank: 2 },
  watch:   { label: 'Keep an eye on',     short: 'watch', rank: 3 },
  prefer:  { label: 'Prefer not',         short: 'prefers not', rank: 4 },
};

// words: whole words/phrases that trigger the item. not: phrases that cancel a match on that ingredient line.
// hint: shown with the flag.
const GLUTEN = { id: 'gluten', label: 'Gluten', level: 'allergy',
  words: ['wheat', 'flour', 'plain flour', 'self raising', 'self-raising', 'bread', 'breadcrumb', 'panko', 'pasta', 'spaghetti', 'noodle', 'couscous', 'semolina', 'bulgur', 'barley', 'rye', 'spelt', 'malt', 'farro', 'freekeh', 'seitan', 'pastry', 'filo', 'phyllo', 'biscuit', 'cracker', 'cake', 'tortilla', 'wrap', 'pita', 'naan', 'brioche', 'crouton', 'oat', 'oats', 'rolled oats', 'soy sauce', 'teriyaki', 'hoisin', 'oyster sauce', 'stock cube', 'stock powder', 'bouillon', 'gravy', 'beer', 'ale', 'stout', 'worcestershire', 'cornflour', 'baking powder'],
  not: ['gluten free', 'gluten-free', 'gf ', 'rice flour', 'almond flour', 'coconut flour', 'tapioca', 'potato flour', 'chickpea flour', 'besan', 'buckwheat', 'rice noodle', 'rice paper', 'tamari', 'corn tortilla', 'maize cornflour', 'cauliflower'],
  hints: { oat: 'Oats are not treated as gluten free under NZ/AU coeliac guidance.', oats: 'Oats are not treated as gluten free under NZ/AU coeliac guidance.',
    'soy sauce': 'Swap for tamari or a GF soy sauce.', cornflour: 'Many NZ cornflours are wheaten. Use maize cornflour.',
    'baking powder': 'Check the label: most are GF, some are not.', 'stock cube': 'Use a GF stock.', 'stock powder': 'Use a GF stock.',
    worcestershire: 'Check the label: some contain malt vinegar.' } };

const SUGARY = { id: 'sugar', label: 'Added sugar', level: 'watch',
  words: ['sugar', 'caster sugar', 'brown sugar', 'icing sugar', 'golden syrup', 'maple syrup', 'honey', 'treacle', 'molasses', 'condensed milk', 'jam', 'syrup', 'chocolate chips', 'marshmallow', 'agave'],
  not: ['sugar free', 'sugar-free', 'no added sugar', 'sugar snap'] };

const ALLERGENS = [
  { id: 'peanut', label: 'Peanut', words: ['peanut', 'peanuts', 'peanut butter', 'satay', 'groundnut'] },
  { id: 'treenut', label: 'Tree nuts', words: ['almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio', 'macadamia', 'brazil nut', 'pine nut', 'nuts', 'mixed nuts', 'praline', 'marzipan', 'frangipane', 'nutella', 'pesto'],
    not: ['nutmeg', 'butternut', 'coconut', 'water chestnut'] },
  { id: 'milk', label: 'Milk', words: ['milk', 'butter', 'cream', 'cheese', 'yoghurt', 'yogurt', 'ghee', 'buttermilk', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta', 'mascarpone', 'custard', 'ice cream', 'whey', 'creme fraiche', 'crème fraîche', 'paneer', 'halloumi', 'haloumi', 'brie', 'camembert', 'gouda', 'quark', 'labneh', 'kefir', 'skyr', 'ghee', 'condensed milk'],
    not: ['coconut milk', 'coconut cream', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'peanut butter', 'nut butter', 'cocoa butter', 'dairy free', 'dairy-free', 'butternut', 'butter beans', 'oat cream', 'soy cream', 'cashew cream', 'plant based', 'plant-based', 'vegan butter', 'vegan cheese'] },
  { id: 'egg', label: 'Egg', words: ['egg', 'eggs', 'egg yolk', 'egg white', 'mayonnaise', 'mayo', 'meringue', 'aioli'], not: ['eggplant', 'egg free', 'egg-free'] },
  { id: 'fish', label: 'Fish', words: ['fish', 'salmon', 'tuna', 'cod', 'snapper', 'tarakihi', 'hoki', 'anchovy', 'anchovies', 'sardine', 'trout', 'fish sauce', 'worcestershire'] },
  { id: 'crustacea', label: 'Crustacea', words: ['prawn', 'prawns', 'shrimp', 'crab', 'crayfish', 'lobster', 'scampi'] },
  { id: 'mollusc', label: 'Molluscs', words: ['mussel', 'mussels', 'oyster', 'oysters', 'scallop', 'scallops', 'squid', 'calamari', 'octopus', 'clam', 'clams', 'pipi', 'tuatua', 'paua', 'oyster sauce'] },
  { id: 'sesame', label: 'Sesame', words: ['sesame', 'tahini', 'hummus', 'houmous', 'sesame oil'] },
  { id: 'soy', label: 'Soy', words: ['soy', 'soya', 'soy sauce', 'tamari', 'tofu', 'edamame', 'miso', 'tempeh', 'soy milk'] },
  { id: 'wheat', label: 'Wheat', words: GLUTEN.words.filter(w => !['barley', 'rye', 'malt', 'oat', 'oats', 'rolled oats', 'beer', 'ale', 'stout'].includes(w)), not: GLUTEN.not },
  { id: 'lupin', label: 'Lupin', words: ['lupin', 'lupini', 'lupin flour'] },
  { id: 'sulphite', label: 'Sulphites', words: ['wine', 'dried apricot', 'dried fruit', 'sultana', 'raisin', 'vinegar', 'sulphite', 'sulfite'], not: ['wine vinegar free'] },
].map(a => ({ ...a, level: 'allergy' }));

const MEAT = ['beef', 'mince', 'steak', 'lamb', 'mutton', 'pork', 'bacon', 'ham', 'chicken', 'turkey', 'duck', 'venison', 'sausage', 'salami', 'chorizo', 'prosciutto', 'pancetta', 'gelatine', 'gelatin', 'lard', 'dripping', 'stock', 'chicken stock', 'beef stock'];

export const PRESETS = [
  { id: 'coeliac', label: 'Coeliac / gluten free', kind: 'condition', items: [GLUTEN],
    note: 'Also watch for cross-contamination: shared toasters, boards, fryers and flour in the air.' },
  { id: 'diabetic', label: 'Diabetic', kind: 'condition', items: [{ ...SUGARY, optional: true }],
    note: 'Carbs per serving will show on every recipe. Flagging every recipe with sugar in it is optional, since a teaspoon in a curry is rarely the issue.' },
  { id: 'whipple', label: 'After Whipple / Creon', kind: 'condition',
    note: 'Commonly reported after a Whipple. Only high fat is flagged to start with: tick the others that bother this person. Everyone is different, so follow your care team. Smaller, more frequent meals often sit better. The app shows fat per serving to help with your own Creon plan. It does not suggest doses.',
    items: [
      { id: 'gassy', label: 'Gassy vegetables', level: 'upset', optional: true,
        words: ['cabbage', 'red cabbage', 'savoy', 'coleslaw', 'slaw', 'sauerkraut', 'kimchi', 'bok choy', 'pak choi', 'brussels sprout', 'brussels sprouts', 'broccoli', 'broccolini', 'cauliflower', 'kale', 'onion', 'onions', 'spring onion', 'shallot', 'leek', 'leeks', 'garlic', 'radish', 'turnip', 'swede', 'asparagus', 'artichoke'] },
      { id: 'legumes', label: 'Beans and lentils', level: 'upset', optional: true,
        words: ['bean', 'beans', 'baked beans', 'kidney beans', 'black beans', 'chickpea', 'chickpeas', 'lentil', 'lentils', 'split peas', 'hummus', 'houmous'], not: ['green beans', 'vanilla bean', 'coffee bean'] },
      { id: 'fatty', label: 'High fat and fried', level: 'watch',
        // clearly rich ingredients only; a knob of butter is everywhere. Fat per serving (coming) is the real measure.
        words: ['deep fry', 'deep-fry', 'deep fried', 'deep frying', 'oil for frying', 'oil for deep frying', 'cream', 'double cream', 'thickened cream', 'heavy cream', 'sour cream', 'mascarpone', 'cream cheese', 'creme fraiche', 'crème fraîche', 'lard', 'dripping', 'pastry', 'puff pastry', 'pork belly', 'bacon', 'chorizo', 'salami', 'coconut cream', 'mayonnaise'],
        not: ['ice cream', 'cream of tartar'] },
      { ...SUGARY, id: 'sugary', label: 'Very sugary (dumping)', level: 'watch', optional: true },
      { id: 'lactose', label: 'Lactose', level: 'upset', optional: true,
        words: ['milk', 'cream', 'ice cream', 'yoghurt', 'yogurt', 'soft cheese', 'ricotta', 'cottage cheese', 'cream cheese', 'condensed milk', 'evaporated milk', 'custard', 'buttermilk'],
        not: ['lactose free', 'lactose-free', 'coconut milk', 'coconut cream', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'oat cream', 'soy cream', 'plant based', 'plant-based'] },
      { id: 'spicy', label: 'Spicy', level: 'upset', optional: true, words: ['chilli', 'chili', 'chillies', 'cayenne', 'jalapeno', 'jalapeño', 'sriracha', 'tabasco', 'hot sauce', 'curry paste', 'harissa', 'gochujang', 'chilli flakes'] },
      { id: 'fizzy', label: 'Fizzy drinks', level: 'upset', optional: true, words: ['soda water', 'lemonade', 'cola', 'ginger beer', 'tonic', 'sparkling', 'fizzy'] },
      { id: 'alcohol', label: 'Alcohol', level: 'upset', optional: true, words: ['wine', 'beer', 'brandy', 'rum', 'vodka', 'whisky', 'whiskey', 'sherry', 'port', 'liqueur', 'cider', 'gin'], not: ['wine vinegar', 'cider vinegar', 'ginger', 'port salut'] },
    ] },
  { id: 'lactose', label: 'Lactose intolerant', kind: 'condition', items: [
      { id: 'lactose', label: 'Lactose', level: 'upset',
        words: ['milk', 'cream', 'ice cream', 'yoghurt', 'yogurt', 'soft cheese', 'ricotta', 'cottage cheese', 'cream cheese', 'condensed milk', 'evaporated milk', 'custard', 'buttermilk'],
        not: ['lactose free', 'lactose-free', 'coconut milk', 'coconut cream', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'oat cream', 'soy cream', 'plant based', 'plant-based'] }] },
  { id: 'vegetarian', label: 'Vegetarian', kind: 'diet', items: [
      { id: 'meat', label: 'Meat', level: 'avoid', words: MEAT, not: ['vegetable stock', 'veggie stock', 'vegetarian'] },
      { id: 'seafood', label: 'Fish and seafood', level: 'avoid', words: [...ALLERGENS[4].words, ...ALLERGENS[5].words, ...ALLERGENS[6].words] }] },
  { id: 'vegan', label: 'Vegan', kind: 'diet', items: [
      { id: 'meat', label: 'Meat', level: 'avoid', words: MEAT, not: ['vegetable stock', 'veggie stock', 'vegan'] },
      { id: 'seafood', label: 'Fish and seafood', level: 'avoid', words: [...ALLERGENS[4].words, ...ALLERGENS[5].words, ...ALLERGENS[6].words] },
      { ...ALLERGENS[2], id: 'dairy', label: 'Dairy', level: 'avoid', not: [...ALLERGENS[2].not, 'vegan'] },
      { ...ALLERGENS[3], label: 'Egg', level: 'avoid', not: [...ALLERGENS[3].not, 'vegan'] },
      { id: 'honey', label: 'Honey', level: 'avoid', words: ['honey'] }] },
  ...ALLERGENS.map(a => ({ id: 'allergy-' + a.id, label: a.label + ' allergy', kind: 'allergen', items: [a] })),
];
export const presetById = id => PRESETS.find(p => p.id === id);

// ---- matching ----
const norm = s => ' ' + String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
const plural = w => w.endsWith('s') ? [w] : [w, w + 's', w + 'es', w.replace(/y$/, 'ies')];
// the longest listed word in the line ("plain flour" rather than "flour"), or null
function hit(line, words){
  let best = null;
  for (const w of words){
    if (best && w.length <= best.length) continue;
    for (const v of plural(norm(w).trim())) if (line.includes(' ' + v + ' ')){ best = w; break; }
  }
  return best;
}
// does this rule flag the text? (its "not" phrases cancel it)
const flags = (text, r) => { const line = norm(text); return r.not.some(n => line.includes(norm(n))) ? null : hit(line, r.words); };

// Optional items start switched off and are turned on per person (presetOn);
// the others start on and can be switched off (presetOff).
export function itemActive(person, pid, it){
  const k = `${pid}:${it.id}`;
  return it.optional ? (person.presetOn || []).includes(k) : !(person.presetOff || []).includes(k);
}

// Expand a person's profile into checks: [{ key, label, level, words, not, hints, source }]
export function rulesFor(person){
  const out = [];
  for (const pid of person.presets || []){
    const p = presetById(pid); if (!p) continue;
    for (const it of p.items){
      if (!itemActive(person, pid, it)) continue;
      out.push({ key: `${pid}:${it.id}`, id: it.id, label: it.label, level: it.level, words: it.words, not: it.not || [], hints: it.hints || {}, source: p.label });
    }
  }
  for (const c of person.custom || []){
    const item = String(c.item || '').trim(); if (!item) continue;
    // a custom "cabbage" also catches the usual cabbage dishes
    const extra = CUSTOM_ALIASES[norm(item).trim()] || [];
    out.push({ key: 'custom:' + item, id: 'custom', label: item, level: c.level || 'upset', words: [item, ...extra], not: [], hints: {}, source: 'own' });
  }
  return out;
}
const CUSTOM_ALIASES = {
  cabbage: ['coleslaw', 'slaw', 'sauerkraut', 'kimchi', 'savoy', 'bok choy', 'pak choi', 'wombok', 'napa cabbage'],
  onion: ['shallot', 'spring onion', 'scallion', 'leek'],
  garlic: ['aioli', 'garlic powder', 'garlic salt'],
  mushroom: ['mushrooms', 'portobello', 'shiitake', 'button mushroom'],
  tomato: ['tomatoes', 'passata', 'tomato paste', 'tomato sauce', 'ketchup', 'salsa'],
  dairy: ALLERGENS[2].words, gluten: GLUTEN.words, nuts: ALLERGENS[1].words,
};

// ingredients: array of strings (or {original|item}). people: [{id, name, presets, presetOff, custom}]
// returns [{ personId, person, rule, label, level, word, ingredient, index, hint, source, alt, lines }], most serious first.
//  alt: the line offers a choice that suits this person ("butter or olive oil" → "olive oil"); these flags sort last.
//  lines: every line this rule flags, each { index, ingredient, word, alt, swap: { to, tip } | null }
export function checkRecipe(ingredients, people){
  const lines = (ingredients || []).map(i => typeof i === 'string' ? i : i.heading ? '' : (i.original || [i.qty, i.unit, i.item, i.note].filter(Boolean).join(' ')));
  const opts = lines.map(l => l ? parseLine(l).options || [l] : []);
  const found = [];
  for (const p of people || []){
    const rules = rulesFor(p);
    const okFor = text => rules.every(r => !flags(text, r));
    for (const r of rules){
      const hits = [];
      lines.forEach((raw, index) => {
        if (!raw) return;
        // with choices, each is checked on its own ("milk or oat milk": the "oat milk" exception mustn't hide the milk)
        const o = opts[index], w = o.length > 1 ? o.map(x => flags(x, r)).find(Boolean) : flags(raw, r);
        if (w) hits.push({ index, ingredient: raw.trim(), word: w, alt: o.length > 1 ? o.find(okFor) || null : null, swap: swapFor(r, w, okFor) });
      });
      if (!hits.length) continue;
      const main = hits.find(h => !h.alt) || hits[0];   // one flag per rule per person, on its worst line
      found.push({ personId: p.id, person: p.name, rule: r.id, label: r.label, level: r.level, word: main.word, ingredient: main.ingredient, index: main.index,
        hint: r.hints[main.word] || Object.entries(r.hints).find(([k]) => norm(main.word).includes(norm(k)))?.[1] || '', source: r.source, alt: hits.every(h => h.alt) ? main.alt : null, lines: hits });
    }
  }
  return found.sort((a, b) => !!a.alt - !!b.alt || LEVELS[a.level].rank - LEVELS[b.level].rank || a.person.localeCompare(b.person));
}
// the flags that still need something done (not already sorted by a choice the recipe gives)
export const openFlags = flags => flags.filter(f => !f.alt);

// ---- swap ideas ----
// Common swaps, by the item that flagged the line. "to" replaces the word in the line; "tip" is advice to read.
// Ideas only, not medical or dietetic advice. Each "to" is checked against everything else the person avoids.
const tip = t => ({ tip: t });
const GF = {
  flour: { to: 'gluten-free plain flour', tip: 'For baking, add ½ tsp xanthan gum per cup if the GF flour has none.' },
  'plain flour': { to: 'gluten-free plain flour', tip: 'For baking, add ½ tsp xanthan gum per cup if the GF flour has none.' },
  'self raising': { to: 'gluten-free self-raising' }, 'self-raising': { to: 'gluten-free self-raising' },
  bread: { to: 'gluten-free bread' }, breadcrumb: { to: 'gluten-free breadcrumbs' }, panko: { to: 'gluten-free panko' },
  pasta: { to: 'gluten-free pasta' }, spaghetti: { to: 'gluten-free spaghetti' }, noodle: { to: 'rice noodle' }, couscous: { to: 'quinoa' },
  semolina: { to: 'fine polenta' }, bulgur: { to: 'quinoa' }, barley: { to: 'brown rice' }, 'soy sauce': { to: 'tamari' },
  'stock cube': { to: 'gluten-free stock cube' }, 'stock powder': { to: 'gluten-free stock powder' }, beer: { to: 'gluten-free beer' },
  wrap: { to: 'gluten-free wrap' }, tortilla: { to: 'corn tortilla' }, cornflour: { to: 'maize cornflour' },
  oat: tip('Oats are not treated as gluten free in NZ. Try quinoa flakes or rice flakes.'), oats: tip('Oats are not treated as gluten free in NZ. Try quinoa flakes or rice flakes.'),
  'rolled oats': tip('Oats are not treated as gluten free in NZ. Try quinoa flakes or rice flakes.'),
};
const DAIRY = {
  milk: { to: 'oat milk' }, butter: { to: 'dairy-free spread' }, cream: { to: 'coconut cream' }, 'sour cream': { to: 'dairy-free yoghurt' },
  cheese: { to: 'dairy-free cheese' }, yoghurt: { to: 'dairy-free yoghurt' }, yogurt: { to: 'dairy-free yoghurt' }, parmesan: { to: 'nutritional yeast' },
  ghee: { to: 'olive oil' }, buttermilk: tip('Use oat milk with 1 tbsp lemon juice per cup.'), 'ice cream': { to: 'dairy-free ice cream' },
};
const LESS_SWEET = 'Use less, or swap some for a sweetener.';
const SWEET = {
  sugar: tip('Most recipes work with about a third less sugar. You can also swap some for a sweetener such as stevia or erythritol.'),
  honey: tip(LESS_SWEET), 'golden syrup': tip(LESS_SWEET), 'maple syrup': tip(LESS_SWEET), syrup: tip(LESS_SWEET),
  jam: { to: 'no-added-sugar jam' }, 'chocolate chips': tip('Use fewer, and dark chocolate (70% or more).'),
  'condensed milk': tip('Look for a reduced-sugar condensed milk, or use less.'),
};
const BAKE = tip('Oven-bake or air-fry instead.');
const FEWER = tip('Use fewer, and rinse tinned ones well.');
const CHIVES = tip('Leave it out, or use chives for the flavour.');
export const SWAPS = {
  gluten: GF, wheat: GF, milk: DAIRY, dairy: DAIRY, sugar: SWEET, sugary: SWEET,
  lactose: {
    milk: { to: 'lactose-free milk' }, cream: { to: 'lactose-free cream' }, yoghurt: { to: 'lactose-free yoghurt' }, yogurt: { to: 'lactose-free yoghurt' },
    'cream cheese': { to: 'lactose-free cream cheese' }, 'ice cream': { to: 'lactose-free ice cream' }, custard: tip('Make the custard with lactose-free milk.'),
    ricotta: tip('Hard cheeses such as cheddar or parmesan are naturally low in lactose.'), 'cottage cheese': tip('Hard cheeses such as cheddar or parmesan are naturally low in lactose.'),
  },
  fatty: {
    cream: { to: 'light evaporated milk' }, 'double cream': { to: 'light evaporated milk' }, 'thickened cream': { to: 'light evaporated milk' }, 'heavy cream': { to: 'light evaporated milk' },
    'sour cream': { to: 'reduced-fat Greek yoghurt' }, 'cream cheese': { to: 'reduced-fat cottage cheese' },
    mascarpone: { to: 'reduced-fat ricotta' }, 'coconut cream': { to: 'light coconut milk' }, mayonnaise: { to: 'Greek yoghurt' },
    bacon: { to: 'lean ham' }, chorizo: { to: 'lean ham' }, salami: { to: 'lean ham' }, 'pork belly': { to: 'pork fillet' }, lard: { to: 'a little olive oil' }, dripping: { to: 'a little olive oil' },
    pastry: tip('Filo brushed lightly with oil has much less fat than puff or shortcrust.'), 'puff pastry': tip('Filo brushed lightly with oil has much less fat than puff pastry.'),
    'deep fry': BAKE, 'deep-fry': BAKE, 'deep fried': BAKE, 'deep frying': BAKE,
    'oil for frying': tip('Oven-bake or air-fry with a spray of oil instead.'), 'oil for deep frying': tip('Oven-bake or air-fry with a spray of oil instead.'),
  },
  gassy: {
    cabbage: { to: 'baby spinach' }, 'red cabbage': { to: 'grated carrot' }, kale: { to: 'baby spinach' }, 'bok choy': { to: 'baby spinach' }, 'pak choi': { to: 'baby spinach' },
    broccoli: { to: 'green beans' }, broccolini: { to: 'green beans' }, 'brussels sprout': { to: 'green beans' }, 'brussels sprouts': { to: 'green beans' }, asparagus: { to: 'green beans' },
    cauliflower: { to: 'zucchini' }, radish: { to: 'cucumber' },
    onion: CHIVES, onions: CHIVES, shallot: CHIVES, leek: CHIVES, leeks: CHIVES, 'spring onion': tip('Use chives instead.'),
    garlic: tip('Use garlic-infused oil: the flavour comes through without the garlic itself.'),
  },
  legumes: {
    bean: tip('Use fewer, rinse tinned ones well, or swap for extra vegetables or diced potato.'), beans: tip('Use fewer, rinse tinned ones well, or swap for extra vegetables or diced potato.'),
    lentil: FEWER, lentils: FEWER, chickpea: FEWER, chickpeas: FEWER,
  },
  spicy: {
    chilli: tip('Leave it out or use less. Sweet paprika gives colour without heat.'), chili: tip('Leave it out or use less. Sweet paprika gives colour without heat.'),
    chillies: tip('Leave them out or use less. Sweet paprika gives colour without heat.'),
    'chilli flakes': { to: 'sweet paprika' }, cayenne: { to: 'sweet paprika' }, 'curry paste': tip('Use a mild curry paste, and less of it.'),
  },
  alcohol: {
    wine: { to: 'stock with a splash of vinegar' }, beer: { to: 'stock' }, cider: { to: 'apple juice' },
    brandy: tip('Use apple juice or stock, or leave it out.'), rum: tip('Use apple juice or a little vanilla, or leave it out.'), sherry: tip('Use stock with a splash of vinegar.'),
  },
  fizzy: { lemonade: tip('Use still water or milk; the result may be a little less light.'), 'soda water': { to: 'still water' } },
  egg: {
    egg: tip('For baking, mix 1 tbsp ground flaxseed with 3 tbsp water for each egg and leave it 5 minutes.'), eggs: tip('For baking, mix 1 tbsp ground flaxseed with 3 tbsp water for each egg and leave it 5 minutes.'),
    mayonnaise: { to: 'egg-free mayonnaise' }, mayo: { to: 'egg-free mayonnaise' },
  },
  meat: {
    mince: { to: 'cooked brown lentils' }, chicken: { to: 'firm tofu' }, stock: { to: 'vegetable stock' }, 'chicken stock': { to: 'vegetable stock' }, 'beef stock': { to: 'vegetable stock' },
    sausage: tip('Use plant-based sausages.'), gelatine: { to: 'agar agar' }, gelatin: { to: 'agar agar' }, bacon: tip('Smoked paprika and mushrooms give a similar smoky taste.'),
  },
  honey: { honey: { to: 'maple syrup' } },
  peanut: { 'peanut butter': { to: 'sunflower seed butter' }, peanuts: { to: 'toasted sunflower seeds' }, peanut: { to: 'toasted sunflower seeds' } },
  treenut: {
    almond: tip('Use toasted pumpkin or sunflower seeds. For ground almonds in baking, use more flour.'),
    cashew: { to: 'toasted pumpkin seeds' }, walnut: { to: 'toasted pumpkin seeds' }, pecan: { to: 'toasted pumpkin seeds' },
  },
  sesame: { tahini: { to: 'sunflower seed butter' }, 'sesame oil': { to: 'olive oil' } },
  soy: { 'soy sauce': { to: 'coconut aminos' }, 'soy milk': { to: 'oat milk' } },
  fish: { 'fish sauce': tip('Use a little extra salt and a squeeze of lime.') },
  sulphite: { vinegar: { to: 'lemon juice' }, wine: { to: 'stock' } },
};
const CUSTOM_ORDER = ['gassy', 'spicy', 'alcohol', 'dairy', 'lactose', 'gluten', 'fatty', 'meat', 'legumes'];
// a swap idea for a word a rule flagged, or null. okFor(text): the swap suits everything the person avoids.
function swapFor(r, word, okFor = () => true){
  const tables = r.id === 'custom' ? CUSTOM_ORDER.map(k => SWAPS[k]) : [SWAPS[r.id]].filter(Boolean);
  for (const t of tables){
    const s = t[word] || t[norm(word).trim()]; if (!s) continue;
    if (s.to && !okFor(s.to)) return null;
    return { ...s };
  }
  return null;
}
// the line with the flagged word swapped ("2 tbsp soy sauce" → "2 tbsp tamari"), or null if the word isn't there
export function swapLine(line, word, to){
  const w = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]+');
  const re = new RegExp(`\\b${w}(?:es|s)?\\b`, 'i');
  return re.test(line) ? line.replace(re, to) : null;
}
// does any of these people's rules flag the text? (to check an AI's swap before showing it)
export const suitsAll = (text, people) => (people || []).every(p => rulesFor(p).every(r => !flags(text, r)));

// What the AI is told to avoid: plain words only, never a person's name or condition.
const AVOID_HOW = { allergy: 'must avoid completely', avoid: 'does not eat', upset: 'avoid', watch: 'less is better', prefer: 'less is better' };
const NEUTRAL = { sugary: 'Added sugar', fatty: 'High-fat and fried foods', gassy: 'Gassy vegetables', legumes: 'Beans and lentils', lactose: 'Lactose' };
export function avoidList(flags){
  const out = new Map();
  for (const f of openFlags(flags)){
    const what = (NEUTRAL[f.rule] || f.label).replace(/\s*\([^)]*\)/g, '').trim();
    const k = `${what} (${AVOID_HOW[f.level] || 'avoid'})`;
    out.set(k, [...new Set([...(out.get(k) || []), ...f.lines.filter(l => !l.alt).map(l => l.word)])]);
  }
  return [...out].map(([k, words]) => `${k}: ${words.join(', ')}`);
}
