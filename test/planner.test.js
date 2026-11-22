import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekStart, iso, addDays, shopName, matchShop, shoppingList, guessCategory, isPantry, amountText } from '../planner.js';

test('weeks start on Monday', () => {
  assert.equal(iso(weekStart(new Date(2026, 10, 22))), '2026-11-16');   // Sunday 22 Nov → Monday 16 Nov
  assert.equal(iso(weekStart(new Date(2026, 10, 16))), '2026-11-16');
  assert.equal(iso(addDays(new Date(2026, 11, 31), 1)), '2027-01-01');
});
test('shopping names drop amounts and preparation', () => {
  assert.equal(shopName('500g beef mince / ground beef'), 'Beef mince');
  assert.equal(shopName('3 garlic cloves , minced'), 'Garlic');
  assert.equal(shopName('2 cloves garlic, minced'), 'Garlic');
  assert.equal(shopName('6 skinless, boneless chicken breast halves'), 'Chicken breast halves');
  assert.equal(shopName('1 large egg'), 'Eggs');
  assert.equal(shopName('1 red capsicum (bell pepper), diced'), 'Red capsicum');
  assert.equal(shopName('2 green onions, halved then finely sliced'), 'Spring onions');
  assert.equal(shopName('1 can (400 g) coconut milk'), 'Coconut milk');
  assert.equal(shopName('1 ½ cups self-raising flour'), 'Self-raising flour');
  assert.equal(shopName('800g can crushed tomato'), 'Crushed tomato');
  assert.equal(shopName('6 – 8 small to medium lettuce leaves (I used baby cos)'), 'Lettuce leaves');
  assert.equal(shopName('2 1/2 tbsp lime juice (1 to 2 limes)'), 'Lime juice');
});
test('matching Shop items like Shop does', () => {
  const items = [{ id: 'a', name: 'Eggs', count: 9 }, { id: 'b', name: 'Onion' }, { id: 'c', name: 'Coconut milk' }, { id: 'd', name: 'Butter salted' }, { id: 'e', name: 'Milk' }];
  assert.equal(matchShop('Eggs', items).item.id, 'a');
  assert.equal(matchShop('Egg', items).item.id, 'a');
  assert.equal(matchShop('Red onion', items).item.id, 'b');
  assert.equal(matchShop('Coconut milk', items).item.id, 'c');   // not "Milk"
  assert.equal(matchShop('Butter', items).item.id, 'd');
  assert.equal(matchShop('Saffron', items), null);
  assert.equal(matchShop('Onion powder', items), null);                      // a powder isn't the fresh thing
});
test('a week of recipes adds up, scaled to servings, with pantry staples set aside', () => {
  const lasagne = { servings: 4, ingredients: [{ original: '500g beef mince' }, { original: '1 onion, diced' }, { original: '2 cloves garlic' }, { original: '1 tsp salt' }, { original: 'TO SERVE', heading: true }, { original: 'Parmesan, to serve' }] };
  const chilli = { servings: 5, ingredients: [{ original: '500g beef mince / ground beef' }, { original: '1 onion , diced' }, { original: '3 garlic cloves, minced' }, { original: '2 tbsp olive oil' }] };
  const list = shoppingList([{ recipe: lasagne, servings: 8, label: 'Lasagne (Tue)' }, { recipe: chilli, servings: 5, label: 'Chilli (Thu)' }]);
  const mince = list.find(x => x.name === 'Beef mince');
  assert.equal(mince.amountText, '1.5 kg');                       // 1 kg doubled lasagne + 500 g chilli
  assert.deepEqual(mince.from, ['Lasagne (Tue)', 'Chilli (Thu)']);
  assert.equal(list.find(x => x.name === 'Onion').amountText, '3');
  assert.equal(list.find(x => x.name === 'Garlic').amountText, '7 cloves');
  assert.ok(list.find(x => x.name === 'Salt').pantry);
  assert.ok(list.find(x => x.name === 'Olive oil').pantry);
  assert.ok(!list.some(x => /parmesan/i.test(x.name)));            // "to serve" lines are left off
  assert.ok(list.findIndex(x => x.pantry) > list.findIndex(x => !x.pantry));
});
test('amounts and categories', () => {
  assert.equal(amountText({ cup: 1.5, tbsp: 2 }), '1 ½ cups + 2 tbsp');
  assert.equal(amountText({ g: 450 }), '450 g');
  assert.equal(guessCategory('Beef mince'), 'Meat & Fish');
  assert.equal(guessCategory('Red onion'), 'Fruit & Veg');
  assert.equal(guessCategory('Coconut milk'), 'Tins & Jars');
  assert.equal(guessCategory('Self-raising flour'), 'Pantry');
  assert.equal(guessCategory('Eggs'), 'Dairy & Eggs');
  assert.equal(guessCategory('Saffron threads'), 'Other');
  assert.equal(guessCategory('Crushed tomato'), 'Tins & Jars');
  assert.equal(guessCategory('Tomato paste'), 'Tins & Jars');
  assert.equal(guessCategory('Fish sauce'), 'Pantry');
  assert.equal(guessCategory('Butternut'), 'Fruit & Veg');
  assert.equal(guessCategory('Butter'), 'Dairy & Eggs');
  assert.equal(guessCategory('Egg noodles'), 'Pantry');
  assert.ok(isPantry('Salt')); assert.ok(isPantry('Cooking salt')); assert.ok(!isPantry('Cayenne pepper'));
  assert.ok(isPantry('Cumin powder')); assert.ok(isPantry('Beef bouillon cubes')); assert.ok(!isPantry('Beef mince'));
});

test('a line with choices lists the first, and offers the others', () => {
  const r = { servings: 4, ingredients: [{ original: '50 g butter or margarine, melted' }, { original: '1 L chicken or vegetable stock' }] };
  const l = shoppingList([{ recipe: r, servings: 4, label: 'Pie' }]);
  const b = l.find(x => x.name === 'Butter'), st = l.find(x => x.name === 'Chicken stock');
  assert.deepEqual(b.options, ['Butter', 'Margarine']);
  assert.deepEqual(st.options, ['Chicken stock', 'Vegetable stock']);
});
