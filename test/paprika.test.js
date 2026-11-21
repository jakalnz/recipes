import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { readPaprika, mapCategories, parseServings, parseTime, parseSteps, parseIngredients, parseNutrition } from '../paprika.js';

// Build a tiny .paprikarecipes zip (stored or deflated entries, each a gzipped JSON) like Paprika does.
function makeZip(entries){
  const locals = [], centrals = []; let off = 0;
  for (const { name, json, deflate } of entries){
    const raw = zlib.gzipSync(Buffer.from(JSON.stringify(json)));
    const data = deflate ? zlib.deflateRawSync(raw) : raw, n = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, data); centrals.push(ch, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

const scones = { uid: 'U1', name: "Steph's Scones", categories: ['Baking', 'Mum'], rating: 5, servings: 'Serves 4-6',
  prep_time: '10 min', cook_time: '00:15', ingredients: '3 cups self-raising flour\n1 cup milk\nTO SERVE:\njam',
  directions: '1. Mix.\n\n2. Bake at 220°C.', notes: 'Nana’s tip: don’t overmix.', source_url: '', photo_data: 'AAAA',
  nutritional_info: 'Fat: 10 grams fat\nCarbohydrate: 52.5 grams carbohydrates\nCalories: 300 calories' };
const curry = { uid: 'U2', name: 'Panang Curry', categories: ['Chicken ', 'Curry '], rating: 0, servings: '6 servings',
  ingredients: '1 ½ lbs chicken thigh', directions: 'Fry onion.\nAdd paste.', source_url: 'https://www.example.com/panang' };

test('reads a Paprika zip with deflated and stored entries', async () => {
  const zip = makeZip([{ name: 'a.paprikarecipe', json: scones, deflate: true }, { name: 'b.paprikarecipe', json: curry }]);
  const { recipes, skipped } = await readPaprika(new Uint8Array(zip));
  assert.equal(skipped.length, 0);
  assert.deepEqual(recipes.map(r => r.title), ['Panang Curry', "Steph's Scones"]);
  const s = recipes[1];
  assert.equal(s.stars, 5);
  assert.equal(s.photo, 'data:image/jpeg;base64,AAAA');
  assert.deepEqual(s.recipe.cats, ['Baking']);
  assert.deepEqual(s.recipe.tags, ["Mum's"]);
  assert.equal(s.recipe.servings, 4);
  assert.equal(s.recipe.cookTime, '15 min');
  assert.deepEqual(s.recipe.steps, ['Mix.', 'Bake at 220°C.']);
  assert.deepEqual(s.recipe.ingredients[2], { original: 'TO SERVE', heading: true });
  assert.deepEqual(s.recipe.nutrition.website, { fat: 10, carbs: 52.5, kcal: 300 });
  assert.equal(s.recipe.nutrition.checked, false);
  assert.equal(s.recipe.source.paprikaUid, 'U1');
  const c = recipes[0];
  assert.deepEqual(c.recipe.cats, ['Dinner']);
  assert.deepEqual(c.recipe.tags, ['Chicken', 'Curry']);
  assert.equal(c.stars, 0);
  assert.equal(c.photo, null);
  assert.deepEqual(c.recipe.steps, ['Fry onion.', 'Add paste.']);
  // converted to metric on import, original kept
  assert.deepEqual(c.recipe.ingredients[0], { original: '675 g chicken thigh', was: '1 ½ lbs chicken thigh' });
  assert.equal(c.recipe.units, 1);
});
test('rejects files that are not zips', async () => {
  await assert.rejects(readPaprika(new Uint8Array([1, 2, 3])), /Paprika export/);
});
test('field parsers', () => {
  assert.deepEqual(mapCategories(['Quick Eats ', 'Beast', 'Party food']), { cats: ['Dinner'], tags: ['Quick', 'Beast', 'Party food'] });
  assert.equal(parseServings('Yield: 16 arayes').servings, 16);
  assert.equal(parseServings('').servings, null);
  assert.equal(parseTime('01:05'), '1 hr 5 min');
  assert.equal(parseTime('20 min'), '20 min');
  assert.deepEqual(parseSteps('Step 1. Boil\n\nStep 2) Drain'), ['Boil', 'Drain']);
  assert.equal(parseIngredients('For the pork belly:\n1 kg pork belly')[0].heading, true);
  assert.deepEqual(parseIngredients('Select all ingredients\nIngredients for the loaf\n500 g mince\nOther Ingredients\n1 egg'),
    [{ original: 'Ingredients for the loaf', heading: true }, { original: '500 g mince' }, { original: 'Other Ingredients', heading: true }, { original: '1 egg' }]);
  assert.equal(parseNutrition('nothing here'), null);
});
