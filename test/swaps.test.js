import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRecipe, openFlags, PRESETS, SWAPS, swapLine, avoidList, suitsAll } from '../diet.js';

const dairyFree = { id: 'a', name: 'Ana', presets: ['allergy-milk'] };
const veg = { id: 'v', name: 'Vic', presets: ['vegetarian'] };
const soyToo = { id: 's', name: 'Sol', presets: ['allergy-milk', 'allergy-soy'] };
const dad = { id: 'd', name: 'Dad', presets: ['whipple'], presetOn: ['whipple:gassy', 'whipple:sugary'] };

test('a line with a safe choice is flagged softly, with the choice', () => {
  const f = checkRecipe(['50 g butter or olive oil'], [dairyFree]);
  assert.equal(f.length, 1);
  assert.equal(f[0].alt, 'olive oil');
  assert.equal(openFlags(f).length, 0);
});
test('no safe choice: "butter or cream" stays a full flag', () => {
  const f = checkRecipe(['50 g butter or cream'], [dairyFree]);
  assert.equal(f[0].alt, null);
  assert.equal(openFlags(f).length, 1);
});
test('a shared last word: vegetarian is fine with "chicken or vegetable stock"', () => {
  const f = checkRecipe(['1 L chicken or vegetable stock'], [veg]);
  assert.equal(f[0].alt, 'vegetable stock');
});
test('a choice must suit everything the person avoids', () => {
  // soy milk is dairy free but not soy free
  assert.equal(checkRecipe(['250 ml milk or soy milk'], [soyToo])[0]?.alt ?? null, null);
  assert.equal(checkRecipe(['250 ml milk or oat milk'], [soyToo])[0].alt, 'oat milk');
});
test('the flag lists every line it found, with swap ideas', () => {
  const f = checkRecipe(['50 g butter', '1 cup cream', '2 eggs'], [dairyFree]);
  assert.deepEqual(f[0].lines.map(l => l.ingredient), ['50 g butter', '1 cup cream']);
  assert.equal(f[0].lines[0].swap.to, 'dairy-free spread');
  assert.equal(swapLine('50 g butter', 'butter', 'dairy-free spread'), '50 g dairy-free spread');
});
test("a swap that clashes with another need isn't offered", () => {
  // soy sauce → coconut aminos is fine; dairy-free swaps go through the soy check too
  const sam = { id: 'c', name: 'Cee', presets: ['coeliac', 'allergy-soy'] };
  const f = checkRecipe(['2 tbsp soy sauce'], [sam]);
  const gluten = f.find(x => x.label === 'Gluten');
  assert.equal(gluten.lines[0].swap, null);   // tamari is soy
  assert.equal(f.find(x => x.label === 'Soy').lines[0].swap.to, 'coconut aminos');
});
test("no built-in swap is flagged by the rule it's listed under", () => {
  for (const p of PRESETS) for (const it of p.items){
    const table = SWAPS[it.id]; if (!table) continue;
    const person = { id: 'x', name: 'X', presets: [p.id], presetOn: p.items.map(i => `${p.id}:${i.id}`) };
    for (const [w, s] of Object.entries(table)) if (s.to){
      const left = checkRecipe([s.to], [person]).filter(f => f.rule === it.id);
      assert.equal(left.length, 0, `${p.id}/${it.id}: "${w}" → "${s.to}" is still flagged`);
    }
  }
});
test('the AI is told what to avoid without names or conditions', () => {
  const f = checkRecipe(['1 cup cream', '1 cup sugar', '½ cabbage, shredded'], [dad]);
  const a = avoidList(f).join('\n');
  assert.doesNotMatch(a, /Dad|Whipple|Creon|dumping/i);
  assert.match(a, /cream/); assert.match(a, /cabbage/);
});
test('suitsAll checks an AI swap against everyone', () => {
  assert.equal(suitsAll('50 g dairy-free spread', [dairyFree]), true);
  assert.equal(suitsAll('50 g ghee', [dairyFree]), false);
});
