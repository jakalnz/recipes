// Dietary presets and the ingredient checker.
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
  { id: 'milk', label: 'Milk', words: ['milk', 'butter', 'cream', 'cheese', 'yoghurt', 'yogurt', 'ghee', 'buttermilk', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta', 'mascarpone', 'custard', 'ice cream', 'whey', 'condensed milk'],
    not: ['coconut milk', 'coconut cream', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'peanut butter', 'nut butter', 'cocoa butter', 'dairy free', 'dairy-free', 'butternut', 'butter beans'] },
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
  { id: 'diabetic', label: 'Diabetic', kind: 'condition', items: [SUGARY],
    note: 'Carbs per serving show on every recipe once they are worked out.' },
  { id: 'whipple', label: 'After Whipple / Creon', kind: 'condition',
    note: 'Commonly reported after a Whipple. Everyone is different, so switch off what doesn’t apply and follow your care team. Smaller, more frequent meals often sit better. The app shows fat per serving to help with your own Creon plan. It does not suggest doses.',
    items: [
      { id: 'gassy', label: 'Gassy vegetables', level: 'upset',
        words: ['cabbage', 'red cabbage', 'savoy', 'coleslaw', 'slaw', 'sauerkraut', 'kimchi', 'bok choy', 'pak choi', 'brussels sprout', 'brussels sprouts', 'broccoli', 'broccolini', 'cauliflower', 'kale', 'onion', 'onions', 'spring onion', 'shallot', 'leek', 'leeks', 'garlic', 'radish', 'turnip', 'swede', 'asparagus', 'artichoke'] },
      { id: 'legumes', label: 'Beans and lentils', level: 'upset',
        words: ['bean', 'beans', 'baked beans', 'kidney beans', 'black beans', 'chickpea', 'chickpeas', 'lentil', 'lentils', 'split peas', 'hummus', 'houmous'], not: ['green beans', 'vanilla bean', 'coffee bean'] },
      { id: 'fatty', label: 'High fat and fried', level: 'watch',
        words: ['deep fry', 'deep-fry', 'deep fried', 'fried', 'cream', 'double cream', 'sour cream', 'mascarpone', 'cream cheese', 'butter', 'lard', 'dripping', 'pastry', 'puff pastry', 'bacon', 'chorizo', 'salami', 'coconut cream', 'mayonnaise', 'oil for frying'] },
      { ...SUGARY, id: 'sugary', label: 'Very sugary (dumping)', level: 'watch' },
      { id: 'lactose', label: 'Lactose', level: 'upset',
        words: ['milk', 'cream', 'ice cream', 'yoghurt', 'yogurt', 'soft cheese', 'ricotta', 'cottage cheese', 'cream cheese', 'condensed milk', 'evaporated milk', 'custard', 'buttermilk'],
        not: ['lactose free', 'lactose-free', 'coconut milk', 'coconut cream', 'almond milk', 'oat milk', 'soy milk', 'rice milk'] },
      { id: 'spicy', label: 'Spicy', level: 'upset', words: ['chilli', 'chili', 'chillies', 'cayenne', 'jalapeno', 'jalapeño', 'sriracha', 'tabasco', 'hot sauce', 'curry paste', 'harissa', 'gochujang', 'chilli flakes'] },
      { id: 'fizzy', label: 'Fizzy drinks', level: 'upset', words: ['soda water', 'lemonade', 'cola', 'ginger beer', 'tonic', 'sparkling', 'fizzy'] },
      { id: 'alcohol', label: 'Alcohol', level: 'upset', words: ['wine', 'beer', 'brandy', 'rum', 'vodka', 'whisky', 'whiskey', 'sherry', 'port', 'liqueur', 'cider', 'gin'], not: ['wine vinegar', 'cider vinegar', 'ginger', 'port salut'] },
    ] },
  { id: 'lactose', label: 'Lactose intolerant', kind: 'condition', items: [
      { id: 'lactose', label: 'Lactose', level: 'upset',
        words: ['milk', 'cream', 'ice cream', 'yoghurt', 'yogurt', 'soft cheese', 'ricotta', 'cottage cheese', 'cream cheese', 'condensed milk', 'evaporated milk', 'custard', 'buttermilk'],
        not: ['lactose free', 'lactose-free', 'coconut milk', 'coconut cream', 'almond milk', 'oat milk', 'soy milk', 'rice milk'] }] },
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
function hit(line, words){
  for (const w of words){
    for (const v of plural(norm(w).trim())) if (line.includes(' ' + v + ' ')) return w;
  }
  return null;
}

// Expand a person's profile into checks: [{ key, label, level, words, not, hints, source }]
export function rulesFor(person){
  const out = [], off = new Set(person.presetOff || []);
  for (const pid of person.presets || []){
    const p = presetById(pid); if (!p) continue;
    for (const it of p.items){
      if (off.has(`${pid}:${it.id}`)) continue;
      out.push({ key: `${pid}:${it.id}`, label: it.label, level: it.level, words: it.words, not: it.not || [], hints: it.hints || {}, source: p.label });
    }
  }
  for (const c of person.custom || []){
    const item = String(c.item || '').trim(); if (!item) continue;
    // a custom "cabbage" also catches the usual cabbage dishes
    const extra = CUSTOM_ALIASES[norm(item).trim()] || [];
    out.push({ key: 'custom:' + item, label: item, level: c.level || 'upset', words: [item, ...extra], not: [], hints: {}, source: 'own' });
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
// returns [{ personId, person, label, level, word, ingredient, hint, source }], most serious first
export function checkRecipe(ingredients, people){
  const lines = (ingredients || []).map(i => typeof i === 'string' ? i : (i.original || [i.qty, i.unit, i.item, i.note].filter(Boolean).join(' ')));
  const found = [];
  for (const p of people || []){
    for (const r of rulesFor(p)){
      for (const raw of lines){
        const line = norm(raw);
        if (r.not.some(n => line.includes(norm(n)))) continue;
        const w = hit(line, r.words); if (!w) continue;
        found.push({ personId: p.id, person: p.name, label: r.label, level: r.level, word: w, ingredient: raw.trim(), hint: r.hints[w] || '', source: r.source });
        break; // one flag per rule per person is enough
      }
    }
  }
  return found.sort((a, b) => LEVELS[a.level].rank - LEVELS[b.level].rank || a.person.localeCompare(b.person));
}
