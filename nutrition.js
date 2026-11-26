// Recipe nutrition from published food composition data (NZ FOODfiles → AFCD → USDA).
// Works in the browser and in Node. Food table format: see scripts/build-foods.mjs.
import { num } from './units.js';

export const FIELDS = ['carbs', 'sugars', 'fibre', 'fat', 'satFat', 'protein', 'kJ', 'sodium'];
const SRC_RANK = { nz: 0, au: 1, us: 2 };

/* ---------- parsing an ingredient line ---------- */
const FR = '½⅓⅔¼¾⅕⅛⅜⅝⅞';
const Q = `(?:\\d+(?:\\.\\d+)?\\s*[${FR}]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${FR}])`;
const UNITS = [
  ['kg', /^(kg|kgs|kilograms?)\b/i], ['g', /^(g|gm|gms|grams?)\b/i], ['ml', /^(ml|mls|millilitres?|milliliters?)\b/i], ['l', /^(l|litres?|liters?)\b/i],
  ['cup', /^(cups?|c)\b/i], ['tbsp', /^(tbsps?|tbs|tbls?|tablespoons?|T)\b/], ['tsp', /^(tsps?|teaspoons?|t)\b/],
  ['tbsp', /^(Tbsp|Tablespoons?)\b/], ['tsp', /^(Tsp|Teaspoons?)\b/],
  ['pinch', /^(pinch(es)?|dash(es)?|sprinkle)\b/i],
  ['clove', /^cloves?\b/i], ['slice', /^slices?\b/i], ['bunch', /^bunch(es)?\b/i], ['handful', /^handfuls?\b/i],
  ['can', /^(cans?|tins?)\b/i], ['packet', /^(packets?|packages?|pkts?|sachets?|jars?|bottles?|tubs?|pottles?|cartons?|bags?|blocks?)\b/i], ['each', /^(rashers?|fillets?|pieces?|whole|medium|large|small|big)\b/i],
];
// counted as nothing (salt matters for sodium, but recipes rarely give a real amount)
const NEGLIGIBLE = /^(?:(?:kosher|sea|table|flaky|fine|rock|iodised|cooking)\s+)?salt\b|^salt (and|&) pepper|^(?:freshly\s+)?(?:ground\s+)?(?:black|white)?\s*pepper(corns)?$|^(?:ground |cracked )?(black|white) pepper\b|(^|\b(cold|warm|hot|boiling|iced|tap)\s+)water\b(?! ?(chestnut|cress))|^ice\b|\b(cooking|oil) spray\b|^spray oil/i;
const OPTIONAL = /\b(to taste|for serving|to serve|for garnish|to garnish|optional|for frying|for greasing|as needed)\b/i;

export function parseLine(text){
  let s = String(text || '').replace(/^\s*(ingredients:?|method:?)\s+/i, '').replace(/^(~|≈|about\s|approx\.?\s)\s*/i, '').trim();
  const res = { text: String(text || ''), qty: null, unit: '', item: '', grams: null, note: '' };
  // "1 can (400 g) coconut milk", "2 cans (170 g each) tuna", "1 (340 g) package egg noodles"
  let m = s.match(new RegExp(`^(${Q})\\s*(?:cans?|tins?|packets?|packages?|jars?|bags?|blocks?|tubs?|bottles?)?\\s*\\(\\s*(${Q})\\s*(kg|g|ml|l)\\b(\\s*each)?\\s*\\)\\s*(?:cans?|tins?|packets?|packages?|pkts?|jars?|bags?|blocks?|tubs?|bottles?)?\\s*(.*)$`, 'i'));
  if (m){
    const n = num(m[1]), q = num(m[2]), u = m[3].toLowerCase();
    const amount = q * (u === 'kg' || u === 'l' ? 1000 : 1) * n;
    res.qty = amount; res.unit = u === 'ml' || u === 'l' ? 'ml' : 'g'; res.item = m[5]; return finish(res);
  }
  // "1 x 400g chickpeas", "2 x 200 g packets"
  m = s.match(new RegExp(`^(${Q})\\s*x\\s*(${Q})\\s*(kg|g|ml|l)\\b\\s*(.*)$`, 'i'));
  if (m){ const u = m[3].toLowerCase(); res.qty = num(m[1]) * num(m[2]) * (u === 'kg' || u === 'l' ? 1000 : 1); res.unit = u === 'ml' || u === 'l' ? 'ml' : 'g'; res.item = m[4]; return finish(res); }
  // quantity (with optional range: "1-2", "2 to 3") then unit
  m = s.match(new RegExp(`^(${Q})(?:\\s*(?:[-–]|to)\\s*(${Q}))?\\s*(.*)$`, 'i'));
  if (m){
    const a = num(m[1]), b = m[2] ? num(m[2]) : null;
    res.qty = b ? (a + b) / 2 : a;
    let rest = m[3].replace(/^x\s+/i, '').replace(/^\([^)]*\)\s*/, '').replace(/^(small|medium|large|big)\s*(to|or|-|–|\/)\s*(small|medium|large|big)\s+/i, '').replace(/^table\s+spoons?\b/i, 'tbsp').replace(/^tea\s+spoons?\b/i, 'tsp')
      .replace(/^(small|medium|large|big|heaped|heaping|level|rounded|scant|generous)\s+(?=(bunch|handful|clove|cloves|can|tin|packet|piece|cup|cups|tbsp|tsp|tablespoons?|teaspoons?)\b)/i, '');
    for (const [u, re] of UNITS){ const um = rest.match(re); if (um){ res.unit = u; rest = rest.slice(um[0].length).replace(/^\.?\s*(of\s+)?/i, ''); break; } }
    res.item = rest;
    // a weight given later in the line wins over a count: "5 to 6 potatoes (500 grams)", "2 chicken breasts, about 400g"
    if (!['g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp'].includes(res.unit)){
      const w = rest.match(new RegExp(`(${Q})\\s*(kg|g|grams?)\\b(\\s*each)?`, 'i'));
      if (w){ res.qty = (w[3] ? res.qty : 1) * num(w[1]) * (/^kg/i.test(w[2]) ? 1000 : 1); res.unit = 'g'; }
    }
  } else {
    const p = s.match(/^(a pinch of|pinch of|a pinch|a dash of|a handful of|handful of|a little|some)\s+(.*)$/i);
    if (p){ res.unit = /pinch|dash/i.test(p[1]) ? 'pinch' : 'handful'; res.qty = 1; res.item = p[2]; }
    else res.item = s;
  }
  // "5 cloves garlic" / "3 garlic cloves"
  if (!res.unit && /\bcloves?\b/i.test(res.item) && /garlic/i.test(res.item)) res.unit = 'clove';
  return finish(res);
}
function finish(res){
  res.note = (res.item.match(/\(([^)]*)\)/g) || []).join(' ');
  // "/ 125 – 375 ml water", "/ ⅔ cup water": a second measure of the same thing
  const orParen = (res.item.match(/\(\s*or\s+[^)]*\)/gi) || []).map(x => ' ' + x.slice(1, -1));   // "soy sauce (or tamari)"
  let it = res.item.replace(/\([^)]*\)/g, ' ').replace(new RegExp(`^\\s*\\/\\s*(${Q})?(\\s*[-–]\\s*${Q})?\\s*(ml|g|l|kg|cups?|tbsp|tsp|tablespoons?|teaspoons?)?\\b\\s*`, 'i'), ' ');
  // drop ", chopped" etc., but keep going if the first part is only describing words ("skinless, boneless chicken breasts")
  res.options = optionsOf(it + orParen.join(''));
  const parts = it.split(/,|;| - | – /);
  it = parts.find(x => toks(x).some(t => !STOP.has(t) && !/^\d/.test(t))) || parts[0];
  it = it.replace(/\s+(or|\/)\s+.*$/i, '');                     // first of alternatives
  res.optional = OPTIONAL.test(res.text) && !/\bplus (extra|more)\b/i.test(res.text);
  res.item = it.replace(/\s{2,}/g, ' ').trim();
  return res;
}

/* ---------- "butter or olive oil": the choices in one ingredient line ---------- */
// text is the item without its amount. Returns the choices (at least one), first as written.
// Not choices: "fresh or frozen peas", "chopped or sliced", "salt, or to taste".
// A shared last word is spread: "chicken or vegetable stock" → chicken stock, vegetable stock.
const NOT_FOOD = new Set(('taste needed desired preferred similar more less required serve serving serves garnish frozen dried tinned canned ' +
  'any your favourite favorite other kind type brand mild homemade store bought fine coarse ground whole').split(' '));
const MODIFIER = new Set(('chicken beef vegetable veggie veg fish lamb pork mushroom white brown red green yellow black rice wine cider apple malt ' +
  'plain wholemeal almond oat soy soya coconut cow light dark sweet smoked greek natural spring olive canola sesame peanut sunflower avocado ' +
  'cheddar tasty parmesan mozzarella feta goat sheep lemon lime orange maple golden caster icing raw demerara corn maize gluten').split(' '));
const realWords = s => (String(s).toLowerCase().match(/[a-zà-ÿ'-]+/g) || []).filter(w => !STOP.has(w) && !NOT_FOOD.has(w));
export function optionsOf(text){
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  let opts = t.split(/\s*,?\s+(?:and\/or|or|either)\s+|\s+\/\s+|(?<=[a-z])\/(?=[a-z])/i)
    .map(o => o.split(/,|;| - | – /).find(x => realWords(x).length || /\w/.test(x)) || '')
    .map(o => o.replace(/^\s*either\s+/i, '').trim()).filter(Boolean);
  if (opts.length < 2) return [t];
  // spread the shared head: "chicken or vegetable stock", "soy or almond milk"
  const last = opts[opts.length - 1].split(' ');
  if (last.length > 1) opts = opts.map((o, i) => i < opts.length - 1 && o.split(' ').every(w => MODIFIER.has(w.toLowerCase())) ? `${o} ${last.slice(1).join(' ')}` : o);
  opts = opts.filter(o => realWords(o).length);
  const seen = new Set(); opts = opts.filter(o => { const k = o.toLowerCase(); return !seen.has(k) && seen.add(k); });
  return opts.length > 1 ? opts : [t];
}

/* ---------- matching a food ---------- */
const STOP = new Set(('a an the of and or for with into to in on about approx large small medium big extra fresh freshly finely roughly coarsely thinly thickly ' +
  'chopped diced minced sliced grated shredded crushed peeled cored seeded deseeded halved quartered cubed julienned torn trimmed drained rinsed ' +
  'packed loosely firmly heaped level softened melted room temperature cold warm hot boiling beaten lightly whisked sifted good quality ' +
  'organic free range boneless skinless skin on bone cut pieces piece bite size inch cm thin thick note notes optional divided separated plus extra ' +
  'serve serving garnish taste store bought homemade fat-free reduced low full fat lean ground').split(' '));
// Common recipe words → how the food tables name them (NZ spelling first)
const SYN = [
  [/\b(all[- ]purpose|plain) flour\b/, 'flour wheat white plain'], [/\bself[- ]raising flour|self[- ]rising flour\b/, 'flour wheat white self-raising'],
  [/\bbread flour|high grade flour\b/, 'flour wheat white high grade'], [/\bwholemeal flour|whole wheat flour\b/, 'flour wheat wholemeal'],
  [/\bcorn ?flour|cornstarch|corn starch\b/, 'cornflour maize'], [/^flour$/, 'flour wheat white plain'],
  [/\b(caster|castor|superfine|granulated|white) sugar\b|^sugar$/, 'sugar white'], [/\bbrown sugar\b/, 'sugar brown'], [/\b(icing|powdered|confectioners'?) sugar\b/, 'sugar icing'],
  [/\bpalm sugar\b/, 'sugar palm'], [/\bhoney\b/, 'honey'], [/\bgolden syrup\b/, 'golden syrup'], [/\bmaple syrup\b/, 'maple syrup'],
  [/\b(unsalted )?butter\b/, 'butter'], [/\bheavy cream|thickened cream|double cream|whipping cream|cream\b/, 'cream'],
  [/\bsour cream\b/, 'cream sour'], [/\bcream cheese\b/, 'cheese cream'], [/\bgreek yogh?urt|natural yogh?urt|plain yogh?urt|yogh?urt\b/, 'yoghurt plain'],
  [/\b(whole |full cream |standard )?milk\b/, 'milk standard'], [/\bbuttermilk\b/, 'buttermilk'], [/\bcondensed milk\b/, 'milk sweetened condensed'], [/\bcoconut milk\b/, 'coconut milk'], [/\bcoconut cream\b/, 'coconut cream'],
  [/\bparmesan\b/, 'cheese parmesan'], [/\bcheddar|tasty cheese\b/, 'cheese cheddar'], [/\bmozzarella\b/, 'cheese mozzarella'], [/\bfeta\b/, 'cheese feta'], [/\bricotta\b/, 'cheese ricotta'],
  [/\beggs?\b(?! noodles)/, 'egg chicken whole raw'], [/\begg yolks?\b/, 'egg yolk raw'], [/\begg whites?\b/, 'egg white raw'],
  [/\b(ground beef|beef mince|minced beef|mince)\b/, 'beef mince raw'], [/\b(chicken mince|ground chicken)\b/, 'chicken mince raw'], [/\bpork mince|ground pork\b/, 'pork mince raw'],
  [/\bchicken breasts?\b/, 'chicken breast flesh raw'], [/\bchicken thighs?\b/, 'chicken thigh flesh raw'], [/\bchicken drumsticks?|drumsticks\b/, 'chicken drumstick raw'],
  [/\bpork belly\b/, 'pork belly raw'], [/\bpork (tenderloin|fillet)\b/, 'pork fillet raw'], [/\bbacon\b/, 'bacon'], [/\bham\b/, 'ham'],
  [/\b(olive|extra virgin olive|light olive) oil\b/, 'oil olive'], [/\b(vegetable|canola|neutral|sunflower|peanut|rice bran|cooking) oil\b|^oil$/, 'oil canola'], [/\bsesame oil\b/, 'oil sesame'], [/\bcoconut oil\b/, 'oil coconut'],
  [/\bspring onions?|green onions?|scallions?\b/, 'onion spring raw'], [/\b(brown |white |yellow |red )?onions?\b/, 'onion raw'],
  [/\bgarlic\b/, 'garlic raw'], [/\bginger\b/, 'ginger root raw'], [/\b(bell )?peppers?\b|\bcapsicums?\b/, 'capsicum raw'], [/\bzucchinis?|courgettes?\b/, 'courgette raw'],
  [/\bcoriander|cilantro\b/, 'coriander leaves raw'], [/\bparsley\b/, 'parsley raw'], [/\bmint\b/, 'mint raw'], [/\bbasil\b/, 'basil raw'],
  [/\bpotato(es)?\b/, 'potato raw'], [/\bkumara|sweet potato(es)?\b/, 'kumara raw'], [/\bcarrots?\b/, 'carrot raw'], [/\bcelery\b/, 'celery raw'], [/\btomato(es)?\b(?! paste| sauce)/, 'tomato raw'],
  [/\bcrushed tomato(es)?|diced tomato(es)?|chopped tomato(es)?|canned tomato(es)?\b/, 'tomato canned'], [/\btomato paste\b/, 'tomato paste'], [/\btomato sauce|ketchup\b/, 'tomato sauce'],
  [/\bkidney beans\b/, 'beans kidney canned drained'], [/\bchickpeas?\b/, 'chickpeas canned drained'], [/\blettuce\b/, 'lettuce raw'], [/\bcucumbers?\b/, 'cucumber raw'],
  [/\bmushrooms?\b/, 'mushroom raw'], [/\bbananas?\b/, 'banana raw'], [/\blemon juice\b/, 'lemon juice'], [/\blime juice\b/, 'lime juice'], [/\blemons?\b/, 'lemon raw'], [/\blimes?\b/, 'lime raw'],
  [/\bsoy sauce\b/, 'soy sauce'], [/\bfish sauce\b/, 'fish sauce'], [/\boyster sauce\b/, 'oyster sauce'],
  [/\brice noodles?\b/, 'noodles rice'], [/\begg noodles\b/, 'noodles egg dry'], [/\b(white |long grain |jasmine |basmati )?rice\b/, 'rice white raw'],
  [/\bbreadcrumbs|bread crumbs|panko\b/, 'breadcrumbs'], [/\bcocoa\b/, 'cocoa powder'], [/\b(dark|cooking|bittersweet) chocolate\b/, 'chocolate dark'], [/\bchocolate chips|choc chips\b/, 'chocolate chips'],
  [/\bbaking powder\b/, 'baking powder'], [/\bbaking soda|bicarb(onate)?( of)? soda\b/, 'baking soda'], [/\bvanilla( extract| essence)?\b/, 'vanilla essence'],
  [/\b(dried )?apricots?\b/, 'apricot dried'], [/\bapricot jam\b/, 'jam apricot'], [/\bpistachios?\b/, 'pistachio'], [/\balmonds?\b/, 'almond'], [/\bhazelnuts?\b/, 'hazelnut'],
  [/\bstock\b|\bbroth\b/, 'stock liquid'], [/\bbouillon|stock cubes?\b/, 'stock cube'], [/\btuna\b/, 'tuna canned in water drained'], [/\bpeas\b/, 'peas green frozen'],
  [/\bsemolina\b/, 'semolina'], [/\btapioca\b/, 'tapioca'], [/\bberries\b/, 'berries mixed'], [/\bmango(es)?\b/, 'mango raw'],
];
const singular = w => w.length > 3 ? (w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('oes') ? w.slice(0, -2) : w.endsWith('es') && /(ch|sh|ss|x)es$/.test(w) ? w.slice(0, -2) : w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w) : w;
const toks = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9-]+/).filter(Boolean).map(singular);

// Pinned foods for everyday ingredients: [what the recipe says, food name pattern(s) tried in order (NZ → AU → US), typical weight of one]
// The longest matching recipe phrase wins, so "chicken mince" beats "mince" and "apricot jam" beats "apricot".
const PINS = [
  // flours, starches, sugars
  [/\b(all[- ]purpose|plain|standard grade|standard) flour\b|^flour$|\bflour\b/, [/^Flour, wheat, white, standard, plain/]],
  [/\bself[- ]rais(ing|ed) flour|self[- ]rising flour\b/, [/^Flour, wheat, white, self-raising/]],
  [/\b(high grade|bread|strong) flour\b/, [/^Flour, wheat, white, high grade/]],
  [/\b(wholemeal|whole wheat|wholewheat) flour\b/, [/^Flour, wheat, wholemeal/]],
  [/\bcorn ?flour|corn ?starch\b/, [/^Flour, cornflour, from maize starch/, /^Flour, corn/]],
  [/\b(white|granulated|regular) sugar\b|^sugar$|\bsugar \(any type\)|\bsugar\b/, [/^Sugar, white/]],
  [/\b(caster|castor|superfine) sugar\b/, [/^Sugar, caster/]],
  [/\b(brown|light brown|dark brown|soft brown) sugar\b/, [/^Sugar, brown/]],
  [/\b(icing|powdered|confectioners'?) sugar\b/, [/^Sugar, icing|Sugar, white, icing/]],
  [/\b(raw|demerara) sugar\b/, [/^Sugar, raw/, /^Sugar, demerara/]],
  [/\bpalm sugar|jaggery\b/, [/^Sugar, palm/i, /palm sugar/i, /^Sugar, brown/]],
  [/\bhoney\b/, [/^Honey, (clover|multi-?floral|blend)/i, /^Honey$/i, /^Honey/]], [/\bgolden syrup\b/, [/golden syrup/i]], [/\bmaple syrup\b/, [/^Syrup, maple/]],
  // dairy & eggs
  [/\bbutter\b/, [/^Butter, salted, composite/]], [/\bunsalted butter\b/, [/^Butter, unsalted/]],
  [/\b(cream|heavy cream|thickened cream|whipping cream|pure cream|cooking cream)\b/, [/^Cream, from cow's milk, plain, regular fat \(35% fat\), pasteurised/]],
  [/\bdouble cream\b/, [/^Cream, from cow's milk, double cream/]], [/\bsour cream\b/, [/^Cream, sour, from cow's milk and cream, regular fat/]],
  [/\bcream cheese\b/, [/^Cheese, cream, from cream and cow’s milk, regular fat/]],
  [/\b(natural|plain|unsweetened) yogh?urt|yogh?urt\b/, [/^Yoghurt, plain, from cow’s milk, 2.5% fat, unsweetened/]], [/\bgreek(-style)? yogh?urt\b/, [/^Yoghurt, plain, Greek, from cow’s milk/]],
  [/\b(whole |full cream |full fat |standard |blue )?milk\b/, [/^Milk, cow, standard \(3.3% fat\), fluid, fresh/, /^Milk, cow, standard/]],
  [/\bbuttermilk\b/, [/^Buttermilk|^Milk, butter/, /Buttermilk/]], [/\bsweetened condensed milk|condensed milk\b/, [/^Milk, condensed, from cow’s milk, whole/]],
  [/\bevaporated milk\b/, [/^Milk, evaporated, from cow’s milk, whole/]],
  [/\bcoconut milk\b/, [/^Coconut, milk, standard/]], [/\bcoconut cream\b/, [/^Coconut, cream, premium/]], [/\bdesiccated coconut\b/, [/^Coconut, white flesh, grated, desiccated/]],
  [/\bparmesan\b/, [/^Cheese, parmesan, from cows' milk, hard, ungrated/]], [/\b(cheddar|tasty|edam|colby)( cheese)?\b|\bgrated cheese\b|^cheese$/, [/^Cheese, Cheddar Mild, composite|^Cheese, cheddar/i]],
  [/\bmozzarella\b/, [/^Cheese, mozzarella/i]], [/\bfeta\b/, [/^Cheese, feta, from cows' milk, soft, traditional/]], [/\bricotta\b/, [/^Cheese, ricotta, from cows' milk, original/]],
  [/\beggs?\b/, [/^Egg, chicken, white & yolk \(whole\), raw/, /^Egg, chicken, whole, raw/], 50],
  [/\begg yolks?\b/, [/^Egg, chicken, yolk, raw/i, /^Egg, yolk, raw/i], 18], [/\begg whites?\b/, [/^Egg, chicken, white, raw/i, /^Egg, white, raw/i], 33],
  // meat & fish
  [/\b(beef mince|minced beef|ground beef|mince)\b/, [/^Beef, mince, standard, 10–20% fat, raw/]],
  [/\b(premium|lean|prime) (beef )?mince\b/, [/^Beef, mince, prime, 5–10% fat, raw/]],
  [/\b(chicken mince|ground chicken|minced chicken)\b/, [/^Chicken, mince, raw/]], [/\b(pork mince|ground pork|minced pork)\b/, [/^Pork, mince, raw/]],
  [/\bchicken breasts?( halves| fillets?)?\b/, [/^Chicken, breast, flesh, lean, fresh, raw/], 200],
  [/\bchicken thighs?( fillets?)?\b/, [/^Chicken, thigh, flesh, lean, fresh, raw/], 120],
  [/\bchicken drumsticks?|drumsticks\b/, [/^Chicken, drumstick, flesh, lean & separable fat, fresh, raw/, /^Chicken, drumstick, flesh, lean, fresh, raw/], 110],
  [/\bchicken( pieces)?$/, [/^Chicken, thigh, flesh, lean, fresh, raw/]],
  [/\bpork belly\b/, [/^Pork, belly, .*raw/i, /^Pork, belly/i]], [/\bpork (tenderloin|fillets?)\b/, [/^Pork, fillet.*raw/i, /^Pork, tenderloin.*raw/i]],
  [/\bbacon( rashers?)?|streaky bacon|bacon\b/, [/^Bacon, middle rasher, untrimmed, raw/], 25],
  [/\btuna\b/, [/^Tuna, in spring water, plain, canned, salt added, drained/]],
  // oils, sauces, condiments
  [/\b(olive|extra virgin olive|light olive) oil\b/, [/^Oil, olive, composite/]],
  [/\b(vegetable|canola|neutral|sunflower|rice bran|cooking|high smoke point cooking|frying) oil\b|^oil$/, [/^Oil, canola, composite/]],
  [/\bpeanut oil\b/, [/^Oil, peanut/]], [/\bsesame oil\b/, [/^Oil, sesame/]], [/\bcoconut oil\b/, [/^Oil, coconut/]],
  [/\bsoy sauce|tamari\b/, [/^Sauce, soy, commercial, composite/]], [/\bfish sauce\b/, [/^Sauce, fish/]], [/\boyster sauce\b/, [/^Sauce, oyster/i, /oyster sauce/i]],
  [/\bhoisin\b/, [/hoisin/i]], [/\bsweet chilli sauce\b/, [/sweet chilli/i]], [/\bworcestershire\b/, [/worcestershire/i]],
  [/\b(tomato sauce|ketchup)\b/, [/^Sauce, tomato, regular, sugar-sweetened/]], [/\btomato paste\b/, [/^Tomato, paste, canned, composite/]], [/\btomato puree|passata\b/, [/^Tomato, puree, canned/]],
  [/\b(crushed|diced|chopped|canned|tinned) tomato(es)?\b/, [/^Tomato, in tomato juice, plain, canned, undrained, salt added/]],
  [/\b(dijon|wholegrain|whole grain|american|yellow|english)? ?mustard\b/, [/^Mustard, creamed, commercial/, /^Mustard, cream style/]],
  [/\bmayonnaise|mayo\b/, [/^Mayonnaise, traditional/]], [/\b(white |cider |rice |coconut |malt )?vinegar\b/, [/^Vinegar$/, /^Vinegar/]],
  [/\b(chicken|beef|vegetable|veggie)? ?(stock|broth)\b/, [/^Stock, liquid, all flavours/]], [/\b(stock|bouillon) cubes?|stock powder|bouillon\b/, [/^Stock, dry powder or cube/], 10],
  // vegetables & herbs
  [/\b(brown |white |yellow )?onions?\b/, [/^Onion, bulb vegetable, flesh, fresh, raw, Brown/], 150], [/\bred onions?\b/, [/^Onion, .*red.*raw/i, /^Onion, bulb vegetable, flesh, fresh, raw, Brown/], 150],
  [/\b(spring onions?|green onions?|scallions?|green shallots?)\b/, [/^Spring onion, bulb vegetable, bulb and stalk, fresh, raw/], 15],
  [/\bshallots?\b/, [/^Shallot.*raw/i], 30],
  [/\bgarlic( cloves?)?|cloves? (of )?garlic\b/, [/^Garlic, bulb vegetable, cloves, raw, peeled/], 4],
  [/\bginger\b/, [/^Ginger, root vegetable, rhizome, raw, peeled/], 10],
  [/\b(red |green |yellow )?(capsicums?|bell peppers?)\b/, [/^Capsicum.*raw/i], 150],
  [/\b(zucchini|zucchinis|courgettes?)\b/, [/^Courgette.*raw/i, /^Zucchini.*raw/i], 200],
  [/\bcarrots?\b/, [/^Carrot.*raw/i], 100], [/\bcelery( sticks?| stalks?)?\b/, [/^Celery.*raw/i], 40],
  [/\bpotato(es)?\b/, [/^Potato, root vegetables, stem tuber, flesh, raw, combined cultivars/], 150], [/\b(kumara|sweet potato(es)?)\b/, [/^Kumara.*raw/i], 180],
  [/\btomato(es)?\b/, [/^Tomato, red, fruit vegetable.*raw/i, /^Tomato, .*raw/i], 120], [/\bcherry tomato(es)?\b/, [/^Tomato, red, fruit vegetable, small, cocktail/i], 15],
  [/\bmushrooms?\b/, [/^Mushroom, fungus, whole, stem & cap, fresh, raw/]],
  [/\b(lettuce|iceberg)\b/, [/^Lettuce.*raw/i], 400], [/\b(lettuce|cos|iceberg|butter lettuce|baby cos)( lettuce)? leaves\b|\blettuce cups\b/, [/^Lettuce.*raw/i], 10],
  [/\bcabbage leaves|leaves of (green )?cabbage\b/, [/^Cabbage, .*raw, (green|common)|^Cabbage, leafy vegetable, raw/i], 30],
  [/\b(french )?onion soup mix|onion (soup|dip) mix\b/, [/^Soup or dip, onion flavoured dry mix/]],
  [/\bcream of mushroom soup|condensed (cream of )?mushroom\b/, [/^Soup, mushroom, condensed|^Soup, cream of mushroom|mushroom.*condensed/i, /^Soup, mushroom/]], [/\bcucumbers?\b/, [/^Cucumber, fruit vegetable, unpeeled, raw/i], 300],
  [/\bspinach\b/, [/^Spinach.*raw/i]], [/\bbroccoli\b/, [/^Broccoli, inflorescent vegetable, raw/]], [/\bcabbage\b/, [/^Cabbage, .*raw, (green|common)|^Cabbage, leafy vegetable, raw/i]],
  [/\b(frozen )?(green )?peas\b/, [/^Pea, seed vegetable, frozen, raw, green/]], [/\b(sweet ?corn|corn kernels)\b/, [/^Corn, sweet.*raw|^Sweetcorn/i]],
  [/\bgreen beans\b/, [/^Bean, green.*raw/i]], [/\bwatercress\b/, [/^Watercress/]], [/\bavocados?\b/, [/^Avocado.*raw/i], 150],
  [/\b(red |green |birds? eye |thai )?chil+(i|ies|ies|is|es|e)\b/, [/^Chilli.*raw/i, /^Pepper, chilli/i], 10],
  [/\b(chinese )?five spice( powder)?\b/, [/five spice/i, /^Spice, mixed/i, /^Spice, cinnamon/]],
  [/\b(cooked|shredded|leftover|roast|rotisserie)( chopped)? chicken\b|\bchicken,? (cooked|shredded)\b/, [/^Chicken, breast, flesh, fresh, baked or roasted/]],
  [/\bgochujang|chilli paste|chili paste|sambal\b/, [/gochujang/i, /chilli paste|chili paste/i, /^Sauce, chilli/i]],
  [/\b(cooking wine|shaoxing|rice wine|mirin)\b/, [/wine, cooking|cooking wine/i, /rice wine/i]],
  [/\bpine nuts?\b/, [/^Nut, pine, dried, raw/]], [/\blemongrass|lemon grass\b/, [/^Lemongrass|^Lemon grass/i], 15],
  [/\b(fresh )?parsley\b/, [/^Parsley, leafy vegetable, raw/]], [/\b(fresh )?(coriander|cilantro)( leaves)?\b/, [/^Herb, coriander, leaves & stem, fresh, raw/]],
  [/\b(fresh )?mint\b/, [/^Mint.*raw|^Herb, mint/i]], [/\b(fresh )?basil\b/, [/^Herb, basil, raw/]], [/\bdried basil\b/, [/^Herb, basil, dried/]],
  [/\b(dried )?oregano\b/, [/^Oregano, dried/, /^Herb, oregano/i]], [/\b(dried )?thyme\b/, [/^Herb, thyme/i, /^Thyme/i]],
  // spices (small amounts; carbs mostly negligible but counted)
  [/\b(ground )?cumin( seeds?| powder)?\b/, [/^Cumin/]], [/\b(ground )?coriander( seeds?| powder)\b|\bground coriander\b/, [/^Coriander seed, dried, ground/]],
  [/\b(ground )?turmeric\b/, [/^Spice, turmeric/]], [/\b(smoked |sweet )?paprika\b/, [/^Spice, paprika/]], [/\bchill?i powder\b/, [/^Spice, chilli powder/]],
  [/\bcayenne( pepper)?\b/, [/^Spice, pepper, red or cayenne/]], [/\b(ground )?cinnamon\b/, [/^Spice, cinnamon/]], [/\bground ginger\b/, [/^Spice, ginger, dried, ground/]],
  [/\b(mixed spice|allspice|seven spice|7 spice|garam masala)\b/, [/^Spice, mixed/i, /garam masala/i, /^Spice, cinnamon/]], [/\bcurry powder\b/, [/^Curry powder/]],
  [/\bgarlic powder\b/, [/^Spice, garlic/i, /Garlic, powder|garlic powder/i]], [/\bonion powder\b/, [/^Spice, onion/i, /onion powder/i]],
  // baking
  [/\bbaking powder\b/, [/^Baking powder$/]], [/\b(baking soda|bicarb(onate)?( of)? soda)\b/, [/^Baking soda/]],
  [/\bvanilla( extract| essence| paste)?\b/, [/^Vanilla extract$/, /^Vanilla bean extract/]],
  [/\bcocoa( powder)?\b/, [/^Cocoa powder/]], [/\b(dark|cooking|bittersweet|semi-?sweet|plain) chocolate\b/, [/^Dark chocolate, cocoa solids \(45–69%\)/, /^Chocolate, dark(?!.*no added sugar)/i]], [/\b70% (cocoa|dark)|70% chocolate\b/, [/^Dark chocolate, cocoa solids \(70–84%\)/]],
  [/\b(chocolate|choc) (chips|bits|drops|melts)\b/, [/^Dark chocolate, cocoa solids \(45–69%\)/, /^Chocolate, dark(?!.*no added sugar)/i], 0, 0.7],
  [/\b(dried )?apricots?\b/, [/^Apricot, dried/]], [/\bapricot jam\b/, [/^Jam, apricot/i, /^Jam/i]], [/\bjam\b/, [/^Jam/i]],
  [/\b(raisins|golden raisins)\b/, [/^Raisin, seedless/]], [/\bsultanas\b/, [/^Sultana/]], [/\bpistachio( kernels| nuts)?s?\b/, [/^Nut, pistachio, dried, raw/]],
  [/\balmonds?\b/, [/^Nut, almond.*raw/i, /^Nut, almond/i]], [/\bhazelnuts?\b/, [/^Nut, hazelnut/i]], [/\bwalnuts?\b/, [/^Nut, walnut/i]], [/\b(roasted )?peanuts?\b/, [/^Nut, peanut|^Peanut/i]],
  [/\b(rolled )?oats\b/, [/^Oats, grains rolled, raw, New Zealand/]], [/\byeast\b/, [/^Yeast, baker's, dried/]], [/\bgelatine?\b/, [/^Gelatin/i]],
  // staples
  [/\b(white |long grain |jasmine |basmati )?rice\b/, [/^Rice, white, regular, assorted grains, polished, raw, dry/]], [/\bcooked (white )?rice\b|\brice,? cooked\b/, [/^Rice, white, assorted grains, polished, cooked in unsalted water/]],
  [/\b(dried )?(pasta|spaghetti|penne|fusilli|macaroni)\b/, [/^Pasta, dried|^Pasta, dry|^Spaghetti, dry|^Pasta, .*dry/i]], [/\begg noodles\b/, [/^Noodle, egg.*dry|^Noodles, egg, dry/i]],
  [/\brice noodles?|vermicelli\b/, [/^Noodle, rice.*(dry|dried)|^Noodles, rice, dry/i, /^Noodle, rice/i]],
  [/\b(bread ?crumbs|breadcrumbs|panko)\b/, [/^Breadcrumbs, white/]], [/\bpitas?( bread)?|pita pockets?\b/, [/^Bread, pita, white, composite/], 60],
  [/\btortillas?|wraps?\b/, [/^Bread, tortilla, white|^Bread, wrap, white/], 45], [/\bsemolina\b/, [/^Semolina/i]], [/\btapioca\b/, [/^Tapioca/i]], [/\bcouscous\b/, [/^Couscous/i]],
  [/\b(red |brown |green )?lentils\b/, [/^Lentil, red or orange, mature, split/]], [/\bchickpeas?\b/, [/^Chickpea.*canned.*drained/i, /^Chickpea/i]],
  [/\b(red )?kidney beans\b/, [/^Bean, red kidney bean, seed, in brine, canned/]], [/\bblack beans\b/, [/^Bean, black, canned in salted water/]],
  // fruit
  [/\bbananas?\b/, [/^Banana, flesh & seed, raw, ripened, yellow/], 120], [/\bapples?\b/, [/^Apple, .*raw/i], 150],
  [/\blemon juice\b|juice of (a |1 |one )?lemon/, [/^Juice, lemon, raw/]], [/\blime juice\b|juice of (a |1 |one )?lime/, [/^Juice, lime, raw|^Lime, juice/i, /^Juice, lime/]],
  [/\blemons?\b/, [/^Lemon, flesh, raw/], 100], [/\blimes?\b/, [/^Lime.*raw/i], 65], [/\bmangos?|mangoes\b/, [/^Mango.*raw/i], 200],
  [/\b(mixed )?berries\b/, [/^Berries, mixed|^Mixed berries/i, /^Raspberry, red colour, raw/]], [/\braspberries\b/, [/^Raspberry, red colour, raw/]],
  [/\bstrawberries\b/, [/^Strawberry, raw/]], [/\bblueberries\b/, [/^Blueberry.*raw/i]],
];
function pinFor(item){
  const low = String(item).toLowerCase();
  let best = null, len = 0;
  for (const p of PINS){ const m = low.match(p[0]); if (m && m[0].length > len){ best = p; len = m[0].length; } }
  return best;
}
// the pinned food in source order (NZ, then AU, then US)
function resolvePin(pin, index){
  for (const re of pin[1]){
    for (const src of ['nz', 'au', 'us']){
      const f = index.foods.find(x => x.src === src && re.test(x.name));
      if (f) return f;
    }
  }
  return null;
}

export function queryFor(item){
  const low = String(item).toLowerCase();
  for (const [re, q] of SYN) if (re.test(low)) return q;
  return toks(low).filter(t => !STOP.has(t) && !/^\d/.test(t)).join(' ');
}
const PREFER = /\b(raw|fresh|composite|plain|standard|regular|unsalted|uncooked|dry|whole)\b/;
const AVOID = /\b(cooked|boiled|baked|roasted|fried|grilled|stewed|microwaved|takeaway|restaurant|fast food|ready to eat|frozen meal|prepared|sandwich|pie|soup|with sauce|infant|baby|meatless|imitation|substitute|fries|chips|crisps|instant|mcdonald's|biscuit|bar)\b/;

export function makeIndex(table){
  const foods = table.foods.map(([id, name, n, d, m]) => {
    const parts = name.split(',');
    return { id, name, src: id.slice(0, 2), n, d, m: m || {}, tk: new Set(toks(name)), hk: new Set(toks(parts[0])), h2: new Set(toks(parts[1] || '')), len: name.length };
  });
  return { foods, byId: new Map(foods.map(f => [f.id, f])), sources: table.sources, fields: table.fields };
}

// Returns up to `k` candidates [{food, score, each?}] best first.
export function matchFood(item, index, k = 5){
  const pin = pinFor(item);
  if (pin){
    index.pinCache ||= new Map();
    if (!index.pinCache.has(pin)) index.pinCache.set(pin, resolvePin(pin, index));
    const f = index.pinCache.get(pin);
    // a pin can give its own density (g/ml) when the table's is for another form, e.g. a block of chocolate vs chips
    const food = f && pin[3] ? { ...f, d: pin[3], m: { ...f.m, cup: undefined, tbsp: undefined, tsp: undefined } } : f;
    if (food) return [{ food, score: 99, hit: 1, of: 1, each: pin[2] || undefined, pinned: true }, ...searchFoods(item, index, k - 1).filter(c => c.food.id !== food.id)];
  }
  return searchFoods(item, index, k);
}
export function searchFoods(item, index, k = 5){
  const q = toks(queryFor(item)); if (!q.length) return [];
  const raw = /\b(cooked|canned|tinned|dried|frozen|roasted|smoked)\b/i.exec(item)?.[1]?.toLowerCase();
  const main = q[q.length - 1];                      // English puts the food last: "dried apricots", "red kidney beans"
  const out = [];
  for (const f of index.foods){
    let hit = 0, headHit = 0;
    for (const t of q){ if (f.tk.has(t)) hit++; if (f.hk.has(t) || f.h2.has(t)) headHit++; }
    if (!hit || !headHit) continue;                  // a query word must be in the food's first two segments
    if (!f.tk.has(main)) continue;
    let s = hit * 3 + headHit * 2 - (q.length - hit) * 3;
    if (PREFER.test(f.name.toLowerCase())) s += 1.5;
    if (AVOID.test(f.name.toLowerCase()) && !(raw && f.name.toLowerCase().includes(raw))) s -= 3;
    if (raw && f.name.toLowerCase().includes(raw === 'tinned' ? 'canned' : raw)) s += 2;
    s -= SRC_RANK[f.src] * 1.2;                     // NZ first, then Australia, then USDA
    s -= Math.min(f.len, 120) / 60;                  // simpler names are usually the generic food
    if (f.hk.size <= q.length + 1) s += 1;
    out.push({ food: f, score: s, hit, of: q.length });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, k);
}

/* ---------- grams ---------- */
const ML = { cup: 250, tbsp: 15, tsp: 5 };
// typical edible weights when a recipe says "2 onions" (used only when the food table has no "each" weight)
const EACH = [[/egg yolk/, 18], [/egg white/, 33], [/\beggs?\b/, 50], [/garlic/, 4], [/spring onion|green onion|scallion/, 15], [/onion|shallot/, 150], [/carrot/, 100],
  [/potato|kumara/, 180], [/tomato/, 120], [/capsicum|pepper/, 150], [/courgette|zucchini/, 200], [/lemon/, 100], [/lime/, 65], [/banana/, 120], [/apple/, 150],
  [/chicken breast/, 200], [/chicken thigh/, 120], [/drumstick/, 110], [/celery/, 40], [/cucumber/, 300], [/avocado/, 150], [/chilli|chili/, 10], [/lettuce/, 400],
  [/mango/, 200], [/pita|tortilla|wrap/, 60], [/stock cube|bouillon/, 10], [/lemongrass|lemon grass/, 15]];
// densities (g/ml) for foods whose table entry has none, mostly dry goods measured in cups and spoons
const DENS = [[/panko/, 0.2], [/breadcrumb/, 0.45], [/flour|cornflour|starch/, 0.55], [/icing sugar/, 0.5], [/brown sugar/, 0.8], [/sugar/, 0.85],
  [/cocoa/, 0.45], [/chocolate/, 0.65], [/oats/, 0.4], [/rice(?! noodle)/, 0.8], [/lentil|chickpea|bean/, 0.8], [/nut|almond|pistachio|hazelnut|walnut|peanut|cashew/, 0.6],
  [/coconut, (white flesh|desiccated)|desiccated/, 0.33], [/baking powder|baking soda|bicarb/, 0.9], [/salt/, 1.2], [/yeast/, 0.8],
  [/dried|ground|powder|seed|spice|cumin|turmeric|paprika|cinnamon|curry/, 0.5], [/oregano|thyme|basil|parsley|coriander|mint|herb/, 0.15],
  [/cheese.*(grated|shredded)|parmesan|cheddar/, 0.45], [/butter|margarine/, 0.92], [/mayonnaise|mayo/, 0.95],
  [/chicken|beef|pork|lamb|meat|mince|bacon|ham/, 0.55], [/wine|beer|alcoholic/, 1.0], [/oil/, 0.92], [/honey|syrup|treacle/, 1.4], [/jam/, 1.3],
  [/milk|cream|stock|juice|sauce|vinegar|water|yoghurt|yogurt/, 1.03]];
const densityOf = (food, item) => food?.d || (DENS.find(([re]) => re.test(`${item} ${food?.name || ''}`.toLowerCase())) || [])[1] || null;

// canned beans, chickpeas and lentils are drained and rinsed: about 60% of the can's net weight is left
export const DRAINED = 0.6;
const drainedLegume = food => /\bdrained\b/i.test(food?.name || '') && /^(bean|chickpea|lentil)/i.test(food?.name || '');
export const isPackLine = p => p.unit === 'can' || p.unit === 'packet';

// pack: one pack's size from Shop, { g } or { ml }, used for "1 can" / "½ packet"
export function toGrams(p, food, each, pack){
  const u = p.unit, q = p.qty;
  if (NEGLIGIBLE.test(p.item) || u === 'pinch') return { g: 0, how: 'negligible' };
  if (q == null) return { g: null, how: 'no amount' };
  if (u === 'g') return { g: q, how: 'weight' };
  if (u === 'kg') return { g: q * 1000, how: 'weight' };
  const dens = densityOf(food, p.item);
  // a table cup weight that disagrees with the density (e.g. whipped cream) is ignored
  if (food?.m?.cup && dens && Math.abs(food.m.cup / 250 - dens) / dens > 0.3) food = { ...food, m: { ...food.m, cup: undefined } };
  if (u === 'ml' || u === 'l'){ const ml = q * (u === 'l' ? 1000 : 1); return dens ? { g: ml * dens, how: 'volume × density' } : { g: ml, how: 'volume (assumed 1 g/ml)', approx: true }; }
  if (ML[u]){
    if (food?.m?.[u]) return { g: q * food.m[u], how: `${u} weight from table` };
    if (dens) return { g: q * ML[u] * dens, how: `${u} × density` };
    return { g: q * ML[u], how: `${u} (assumed 1 g/ml)`, approx: true };
  }
  if (u === 'clove') return { g: q * 4, how: 'clove ≈ 4 g', approx: true };
  if (u === 'slice') return { g: q * (food?.m?.each || 30), how: 'slice', approx: true };
  if (u === 'bunch' || u === 'handful') return { g: q * (u === 'bunch' ? 50 : 20), how: `${u} (rough)`, approx: true };
  if ((u === 'can' || u === 'packet') && (pack?.g > 0 || pack?.ml > 0)){
    const dens = pack.g ? 1 : densityOf(food, p.item);
    let g = q * (pack.g || pack.ml * (dens || 1)), how = `${u} from Shop: ${pack.g ? `${Math.round(pack.g)} g` : `${Math.round(pack.ml)} ml`}`;
    const approx = !pack.g && !dens;
    if (u === 'can' && drainedLegume(food)){ g *= DRAINED; how += `, drained ≈ ${DRAINED * 100}%`; }
    return { g, how, approx: approx || u === 'can' && drainedLegume(food) };
  }
  if (u === 'can' || u === 'packet') return { g: null, how: `size of ${u} unknown` };
  // a count: "2 eggs", "1 onion", "10 bacon rashers"
  if (each) return { g: q * each, how: `each ≈ ${each} g`, approx: true };
  if (food?.m?.each) return { g: q * food.m.each, how: `each: ${food.m.eachLabel || 'table weight'}` };
  const e = EACH.find(([re]) => re.test(p.item.toLowerCase()));
  if (e) return { g: q * e[1], how: `each ≈ ${e[1]} g`, approx: true };
  return { g: null, how: 'unknown size' };
}

/* ---------- a whole recipe ---------- */
// overrides: { [lineIndex]: { foodId?, grams?, skip? } }
// opts.packFor(parsedLine, lineIndex) → one pack's size { g } or { ml } (from Shop), or null
export function computeRecipe(recipe, index, overrides = {}, opts = {}){
  const lines = [], total = Object.fromEntries(FIELDS.map(f => [f, 0]));
  let weight = 0;
  (recipe.ingredients || []).forEach((ing, i) => {
    if (ing.heading) return;
    const p = parseLine(ing.original), o = overrides[i] || {};
    const L = { i, text: ing.original, item: p.item, status: 'ok' };
    if (o.skip || (p.optional && !o.foodId && o.grams == null)){ L.status = 'skipped'; L.how = o.skip ? 'left out' : 'optional / to serve'; lines.push(L); return; }
    if (NEGLIGIBLE.test(p.item) && !o.foodId){ L.status = 'skipped'; L.how = 'negligible'; lines.push(L); return; }
    if (p.qty == null && o.grams == null){ L.status = 'no amount'; L.how = 'no amount given, not counted'; lines.push(L); return; }
    if (/^(\d+\s*x\s*)+$/i.test(ing.original.trim())){ L.status = 'skipped'; L.how = 'not an ingredient'; lines.push(L); return; }
    let cand = o.foodId ? [{ food: index.byId.get(o.foodId), score: 99, hit: 1, of: 1 }] : matchFood(p.item, index, 5);
    // "4 fresh vine ripened or ox heart tomatoes": if the first part names nothing, try the whole line
    if (!cand.length) cand = matchFood(ing.original.replace(/\([^)]*\)/g, ' ').replace(new RegExp(`^\\s*${Q}`), ''), index, 5);
    const best = cand[0]?.food;
    if (!best){ L.status = 'unmatched'; lines.push(L); return; }
    L.food = best; L.alts = cand.slice(1).map(c => c.food); L.pinned = !!cand[0].pinned;
    L.confident = !!o.foodId || !!cand[0].pinned || cand[0].hit === cand[0].of;
    L.packLine = isPackLine(p);
    const pack = L.packLine && o.grams == null && opts.packFor ? opts.packFor(p, i) : null;
    if (pack) L.pack = pack;
    const g = o.grams != null ? { g: +o.grams, how: 'entered' } : toGrams(p, best, cand[0].each, pack);
    L.grams = g.g; L.how = g.how; L.approx = !!g.approx && o.grams == null;
    if (g.how === 'negligible'){ L.status = 'skipped'; lines.push(L); return; }
    if (g.g == null){ L.status = 'no grams'; lines.push(L); return; }
    L.values = {};
    FIELDS.forEach((f, k) => { const v = best.n[k]; const x = v == null ? 0 : v * g.g / 100; L.values[f] = x; total[f] += x; });
    weight += g.g;
    if (!L.confident) L.status = 'check';            // approximate weights (≈) are shown but not flagged
    lines.push(L);
  });
  const servings = +recipe.servings || null;
  const per = servings ? Object.fromEntries(FIELDS.map(f => [f, total[f] / servings])) : null;
  const per100 = weight ? Object.fromEntries(FIELDS.map(f => [f, total[f] / weight * 100])) : null;
  const problems = lines.filter(l => l.status === 'unmatched' || l.status === 'no grams').length;
  return { lines, total, weight, servings, perServing: per, servingGrams: servings ? weight / servings : null, per100, problems,
    checks: lines.filter(l => l.status === 'check').length,
    sources: [...new Set(lines.filter(l => l.food).map(l => l.food.src))] };
}
