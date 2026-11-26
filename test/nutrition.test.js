// Uses a tiny made-up food table (round values per 100 g, not copied from any source) so the tests don't need the licensed data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, makeIndex, matchFood, toGrams, computeRecipe } from '../nutrition.js';

const table = { fields: [], sources: {}, foods: [
  // id, name, [carbs, sugars, fibre, fat, satFat, protein, kJ, sodium], density, measures
  ['nz:E1088', 'Flour, wheat, white, standard, plain, composite', [70, 2, 3, 2, 0.4, 11, 1450, 5], 0.58, { cup: 146, tbsp: 9 }],
  ['nz:W24', 'Sugar, white', [100, 100, 0, 0, 0, 0, 1700, 0], 0.99, { cup: 247, tsp: 4.9 }],
  ['nz:W1028', 'White chocolate, plain, milk solids and sugar', [58, 58, 0, 32, 19, 7, 2290, 90], 0.5, 0],
  ['nz:F1046', 'Butter, salted, composite', [0.5, 0.5, 0, 80, 50, 0.5, 3000, 550], 0.91, { cup: 225, tbsp: 14, tsp: 5 }],
  ['nz:G1016', 'Egg, chicken, white & yolk (whole), raw, fresh', [0.3, 0.3, 0, 9.5, 2.8, 12.6, 560, 140], null, 0],
  ['nz:M1233', 'Beef, mince, standard, 10–20% fat, raw, composite', [0, 0, 0, 15, 6.5, 19, 900, 70], 0.82, 0],
  ['au:F002739', 'Chicken, mince, raw', [0, 0, 0, 8, 2.4, 19, 640, 70], null, 0],
  ['nz:X1130', 'Onion, bulb vegetable, flesh, fresh, raw, Brown, combined cultivars', [6.5, 5, 1.6, 0.1, 0, 1.2, 140, 3], 0.5, { cup: 110 }],
  ['nz:F1110', 'Milk, cow, standard (3.3% fat), fluid, fresh', [4.7, 4.7, 0, 3.3, 2.1, 3.4, 270, 40], 1.03, { cup: 253 }],
  ['nz:F10006', "Cream, from cow's milk, plain, regular fat (35% fat), pasteurised, refrigerated, composite", [3, 3, 0, 35, 22, 2, 1400, 30], 1, { cup: 150 }],
  ['au:F001683', 'Breadcrumbs, white', [72, 4, 4, 4, 1, 12, 1500, 600], null, 0],
  ['nz:X1264', 'Lettuce, iceberg, green, leafy vegetable, raw', [1.6, 1.5, 1, 0.1, 0, 0.8, 50, 10], 0.3, 0],
] };
const idx = makeIndex(table);

test('parse amounts, units, ranges and cans', () => {
  assert.deepEqual([parseLine('1 ½ cups self-raising flour').qty, parseLine('1 ½ cups self-raising flour').unit], [1.5, 'cup']);
  assert.equal(parseLine('2 to 3 teaspoons lemon juice').qty, 2.5);
  assert.equal(parseLine('1-2 tbsp sugar').unit, 'tbsp');
  assert.deepEqual([parseLine('1 can (400 g) coconut milk').qty, parseLine('1 can (400 g) coconut milk').unit], [400, 'g']);
  assert.equal(parseLine('2 cans (170 g each) tuna, drained').qty, 340);
  assert.equal(parseLine('1 x 400g chickpeas').qty, 400);
  assert.equal(parseLine('4 table spoons olive oil').unit, 'tbsp');
  assert.equal(parseLine('2 pork tenderloin (pork fillet), 500g each').qty, 1000);
  assert.equal(parseLine('6 skinless, boneless chicken breast halves').item, 'boneless chicken breast halves');
  assert.equal(parseLine('⅓ cup coriander leaves, plus extra to garnish').optional, false);
  assert.equal(parseLine('3 tbsp crushed peanuts (optional)').optional, true);
});
test('everyday ingredients go to the right food', () => {
  assert.equal(matchFood('sugar', idx)[0].food.id, 'nz:W24');           // not white chocolate
  assert.equal(matchFood('chicken mince', idx)[0].food.id, 'au:F002739'); // not beef mince
  assert.equal(matchFood('beef mince / ground beef', idx)[0].food.id, 'nz:M1233');
  assert.equal(matchFood('plain flour', idx)[0].food.id, 'nz:E1088');
});
test('grams from cups, spoons, densities and counts', () => {
  const flour = idx.byId.get('nz:E1088'), cream = idx.byId.get('nz:F10006'), crumbs = idx.byId.get('au:F001683');
  assert.equal(toGrams(parseLine('2 cups flour'), flour).g, 292);
  assert.equal(Math.round(toGrams(parseLine('1 cup cream'), cream).g), 250);   // the table's whipped-cream cup is ignored
  assert.equal(Math.round(toGrams(parseLine('1 cup breadcrumbs'), crumbs).g), 113);
  assert.equal(toGrams(parseLine('3 eggs'), idx.byId.get('nz:G1016'), 50).g, 150);
  assert.equal(toGrams(parseLine('½ tsp salt'), null).how, 'negligible');
});
test('a recipe adds up per serving and per 100 g', () => {
  const r = computeRecipe({ servings: 4, ingredients: [
    { original: '2 cups plain flour' }, { original: '100 g butter' }, { original: '½ cup sugar' },
    { original: 'TO SERVE', heading: true }, { original: '1 tsp salt' }, { original: 'Whipped cream, to serve' },
  ] }, idx);
  const flourG = 292, sugarG = 123.5;
  const carbs = flourG * 0.70 + 100 * 0.005 + sugarG;
  assert.ok(Math.abs(r.total.carbs - carbs) < 0.5, `carbs ${r.total.carbs} vs ${carbs}`);
  assert.ok(Math.abs(r.perServing.carbs - carbs / 4) < 0.2);
  assert.ok(Math.abs(r.perServing.fat - (flourG * 0.02 + 80) / 4) < 0.2);
  assert.equal(Math.round(r.servingGrams), Math.round((flourG + 100 + sugarG) / 4));
  assert.equal(r.lines.find(l => l.text === '1 tsp salt').status, 'skipped');
  assert.equal(r.lines.find(l => l.text.startsWith('Whipped')).status, 'skipped');
  assert.equal(r.problems, 0);
});
test('overrides: choose a food, enter grams, or leave a line out', () => {
  const rec = { servings: 2, ingredients: [{ original: '6 lettuce leaves' }, { original: '1 packet mystery mix' }] };
  const a = computeRecipe(rec, idx);
  assert.equal(a.lines[0].grams, 60);
  assert.equal(a.lines[1].status, 'unmatched');
  const b = computeRecipe(rec, idx, { 1: { foodId: 'nz:W24', grams: 40 } });
  assert.equal(b.lines[1].grams, 40);
  assert.equal(b.problems, 0);
  const c = computeRecipe(rec, idx, { 1: { skip: true } });
  assert.equal(c.lines[1].status, 'skipped');
});

test('cans and packets use the pack size from Shop, a fraction of it, and drained beans', () => {
  const t2 = makeIndex({ ...table, foods: [...table.foods,
    ['nz:X10047', 'Bean, black, canned in salted water (brine), drained, composite', [11, 0.6, 7, 0.7, 0.1, 7.7, 405, 210], null, 0],
    ['nz:C1', 'Coconut, milk, standard, canned', [3, 2, 0, 17, 15, 1.6, 700, 15], 1.02, 0]] });
  const rec = { servings: 2, ingredients: [{ original: '1 can black beans, drained' }, { original: '½ can coconut milk' },
    { original: '1 can (400 g) coconut milk' }, { original: '2 packets mystery mix' }] };
  const sizes = { 'black beans': { g: 400 }, 'coconut milk': { ml: 400 } };
  const r = computeRecipe(rec, t2, {}, { packFor: p => sizes[p.item] || null });
  assert.equal(r.lines[0].grams, 240);                       // 400 g × 60% drained
  assert.equal(r.lines[0].approx, true);
  assert.equal(Math.round(r.lines[1].grams), 204);           // ½ × 400 ml × 1.02 g/ml
  assert.equal(r.lines[2].grams, 400);                       // a weight in the line wins
  assert.equal(r.lines[2].pack, undefined);
  // without pack sizes, cans can't be counted
  assert.equal(computeRecipe(rec, t2).lines[0].status, 'no grams');
  // grams entered by hand win over the pack
  assert.equal(computeRecipe(rec, t2, { 0: { grams: 300 } }, { packFor: p => sizes[p.item] || null }).lines[0].grams, 300);
  assert.equal(parseLine('1 jar pesto').unit, 'packet');
});

test('choices in one line: "or", "/", "(or …)", with a shared last word spread', () => {
  const o = l => parseLine(l).options;
  assert.deepEqual(o('50 g butter or olive oil'), ['butter', 'olive oil']);
  assert.deepEqual(o('1 L chicken or vegetable stock'), ['chicken stock', 'vegetable stock']);
  assert.deepEqual(o('250 ml soy or almond milk'), ['soy milk', 'almond milk']);
  assert.deepEqual(o('2 tbsp soy sauce (or tamari)'), ['soy sauce', 'tamari']);
  assert.deepEqual(o('50 g butter or margarine, melted'), ['butter', 'margarine']);
  assert.deepEqual(o('200 g chicken or tofu'), ['chicken', 'tofu']);
});
test('not choices: descriptions, "to taste", and a second measure', () => {
  const n = l => parseLine(l).options.length;
  assert.equal(n('2 cups fresh or frozen peas'), 1);
  assert.equal(n('1 onion, chopped or sliced'), 1);
  assert.equal(n('salt, or to taste'), 1);
  assert.equal(n('125 ml / ½ cup water'), 1);
  assert.equal(n('salt and pepper'), 1);
});
