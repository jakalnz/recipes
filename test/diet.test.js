import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRecipe, PRESETS, LEVELS } from '../diet.js';

const dad = { id: 'dad', name: 'Dad', presets: ['whipple'], custom: [{ item: 'cabbage', level: 'upset' }] };
const sam = { id: 'sam', name: 'Sam', presets: ['coeliac'] };
const kid = { id: 'kid', name: 'Kid', presets: ['allergy-peanut', 'allergy-treenut'] };

test("Dad's own cabbage entry catches coleslaw", () => {
  const f = checkRecipe(['2 cups coleslaw mix'], [dad]);
  assert.ok(f.some(x => x.label === 'cabbage' && x.level === 'upset'));
});
test('After Whipple starts with only high fat flagged', () => {
  const f = checkRecipe(['1 onion, diced', '1 can (400 g) kidney beans', '1 tsp sugar', '½ cup cream'], [{ ...dad, custom: [] }]);
  assert.deepEqual(f.map(x => x.label), ['High fat and fried']);
});
test('optional Whipple flags can be ticked on per person', () => {
  const p = { ...dad, custom: [], presetOn: ['whipple:gassy', 'whipple:legumes'] };
  const labels = checkRecipe(['1 onion, diced', '1 can (400 g) kidney beans'], [p]).map(x => x.label);
  assert.ok(labels.includes('Gassy vegetables'));
  assert.ok(labels.includes('Beans and lentils'));
});
test('default flags can be switched off per person', () => {
  assert.equal(checkRecipe(['½ cup cream'], [{ ...dad, custom: [], presetOff: ['whipple:fatty'] }]).length, 0);
});
test('diabetic sugar flag is opt-in', () => {
  const d = { id: 'd', name: 'D', presets: ['diabetic'] };
  assert.equal(checkRecipe(['1 tsp sugar'], [d]).length, 0);
  assert.equal(checkRecipe(['1 tsp sugar'], [{ ...d, presetOn: ['diabetic:sugar'] }]).length, 1);
});
test('green beans are not flagged as legumes', () => {
  const p = { ...dad, custom: [], presetOn: ['whipple:legumes'] };
  assert.equal(checkRecipe(['200 g green beans'], [p]).filter(x => x.label === 'Beans and lentils').length, 0);
});
test('coeliac: flour flagged, rice flour not, oats get a hint', () => {
  assert.equal(checkRecipe(['1 cup plain flour'], [sam]).length, 1);
  assert.equal(checkRecipe(['1 cup rice flour'], [sam]).length, 0);
  assert.equal(checkRecipe(['1 cup gluten-free flour'], [sam]).length, 0);
  assert.match(checkRecipe(['1 cup rolled oats'], [sam])[0].hint, /Oats/);
  assert.match(checkRecipe(['2 tbsp soy sauce'], [sam])[0].hint, /tamari/);
});
test('nut allergy: nutmeg, butternut and coconut are fine, almonds are not', () => {
  assert.equal(checkRecipe(['1 tsp nutmeg', '1 butternut', '1 cup coconut'], [kid]).length, 0);
  const f = checkRecipe(['½ cup almonds'], [kid]);
  assert.equal(f[0].level, 'allergy');
});
test('results are sorted most serious first', () => {
  const f = checkRecipe(['1 cup flour', '1 cup cream'], [sam, { ...dad, custom: [] }]);
  assert.equal(f[0].level, 'allergy');
});
test('every preset item has a known level and some words', () => {
  for (const p of PRESETS) for (const it of p.items){
    assert.ok(LEVELS[it.level], `${p.id}:${it.id} level`);
    assert.ok(it.words.length, `${p.id}:${it.id} words`);
  }
});
