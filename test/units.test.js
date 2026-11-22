import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMetric, convertTemps, num, metricRecipe, scaleLine, niceQty } from '../units.js';

const cases = [
  // both units given: keep the metric
  ['1 lb / 500g beef mince / ground beef', '500g beef mince / ground beef'],
  ['800g / 28 oz can crushed tomato', '800g can crushed tomato'],
  ['14 oz / 420g can red kidney beans , drained (or other beans)', '420g can red kidney beans, drained (or other beans)'],
  ['3 eggs (~55g/2 oz each)', '3 eggs (~55g each)'],
  ['125g / 4.5 oz dark cooking chocolate , bittersweet / 70% cocoa (Note 1)', '125g dark cooking chocolate, bittersweet / 70% cocoa (Note 1)'],
  ['600g / 1.2lb chicken breasts (2 large) (Note 1)', '600g chicken breasts (2 large) (Note 1)'],
  ['500 g/1 lb zucchini (2 medium ~ 23cm/9" long)', '500 g zucchini (2 medium ~ 23cm long)'],
  ['Flatten lightly with spatula to about 1cm / 4/5" thick.', 'Flatten lightly with spatula to about 1cm thick.'],
  ['spread into 11cm / 4.5" circle', 'spread into 11cm circle'],
  ['3 garlic cloves , minced', '3 garlic cloves , minced'],
  ['11 ounces (310g) berries I used a mix', '310g berries I used a mix'],
  ['1 lb skin-on chicken thigh (455 g), cubed', '455 g skin-on chicken thigh, cubed'],
  ['2 pork tenderloin (pork fillet), 500g/1lb each (Note 1)', '2 pork tenderloin (pork fillet), 500g each (Note 1)'],
  ['1 large egg (~50g / 2oz in shell)', '1 large egg (~50g in shell)'],
  // convert
  ['1 lb ground beef 90% lean', '450 g ground beef 90% lean'],
  ['1 pound ground beef', '450 g ground beef'],
  ['4 pounds chicken drumsticks (about 12 drumsticks)', '1.8 kg chicken drumsticks (about 12 drumsticks)'],
  ['2 pounds chicken breasts', '900 g chicken breasts'],
  ['1 ½ lbs chicken thigh boneless', '675 g chicken thigh boneless'],
  ['1 lb. boneless skinless chicken breasts', '450 g boneless skinless chicken breasts'],
  ['6 ounces rice noodles', '170 g rice noodles'],
  ['8 oz butter', '225 g butter'],
  ['2 sticks butter', '225 g butter'],
  // cans first, weight in brackets
  ['1 can (14 oz) coconut milk', '1 can (400 g) coconut milk'],
  ['2 (6 ounce) cans tuna, drained', '2 cans (170 g each) tuna, drained'],
  ['1 (10.5 ounce) can fat-free condensed cream of mushroom soup', '1 can (300 g) fat-free condensed cream of mushroom soup'],
  ['1 (14.5 oz) can diced tomatoes', '1 can (400 g) diced tomatoes'],
  ['15 oz can black beans', '1 can (400 g) black beans'],
  ['1 (12 ounce) package egg noodles', '1 (340 g) package egg noodles'],
  ['1 (8 ounce) package sliced fresh mushrooms', '1 (225 g) package sliced fresh mushrooms'],
  // liquids, inches
  ['16 fl oz milk', '475 ml milk'],
  ['1 pint cream', '475 ml cream'],
  ['1 (1-inch) piece fresh ginger, grated', '1 (2.5 cm) piece fresh ginger, grated'],
  ['½ inch galangal roughly sliced', '1.5 cm galangal roughly sliced'],
  ['cut into 1 inch pieces', 'cut into 2.5 cm pieces'],
  ['a 9x13 inch baking dish', 'a 23 x 33 cm baking dish'],
  // left alone
  ['1 ½ cups self-raising flour', '1 ½ cups self-raising flour'],
  ['2 tbsp soy sauce', '2 tbsp soy sauce'],
  ['1 diced stick of celery', '1 diced stick of celery'],
  ['70g (1/3 cup) dried apricots', '70g (1/3 cup) dried apricots'],
];
for (const [inp, out] of cases) test(`ingredient: ${inp}`, () => assert.equal(toMetric(inp), out));

const temps = [
  ['Preheat the oven to 400°F and brush', 'Preheat the oven to 200°C and brush'],
  ['Preheat oven to 350 degrees F (175 degrees C).', 'Preheat oven to 175°C.'],
  ['Preheat the oven to 375 degrees Fahrenheit.', 'Preheat the oven to 190°C.'],
  ['Preheat oven to 180C/350F', 'Preheat oven to 180°C'],
  ['internal temperature is 68C / 155F (Note 4)', 'internal temperature is 68°C (Note 4)'],
  ['Preheat oven to 200F/100C (for keeping fritters warm)', 'Preheat oven to 100°C (for keeping fritters warm)'],
  ['min 35C / 95F; ideal 40C / 104F', 'min 35°C; ideal 40°C'],
  ['warm (min 35C / 95F; ideal 40C / 104F).', 'warm (min 35°C; ideal 40°C).'],
  ['heat to 375°F', 'heat to 190°C'],
  ['Preheat oven to 180°C/160°C fan forced', 'Preheat oven to 180°C/160°C fan forced'],
  ['Bake at 325 F for 1 hour', 'Bake at 160°C for 1 hour'],
];
for (const [inp, out] of temps) test(`temperature: ${inp}`, () => assert.equal(convertTemps(inp), out));

test('tin sizes in whole cm, with the right article', () => {
  assert.equal(toMetric('Bake at 325 F for 30 minutes in an 8 inch tin.'), 'Bake at 160°C for 30 minutes in a 20 cm tin.');
  assert.equal(toMetric('Use a 3 inch cutter.'), 'Use an 7.5 cm cutter.'.replace('an 7', 'a 7'));
});
test('step text gets inches and temperatures', () => {
  assert.equal(toMetric('Add about 3 inches of oil and heat to 375°F.'), 'Add about 7.5 cm of oil and heat to 190°C.');
});
test('no ounces, pounds or Fahrenheit survive', () => {
  for (const [inp] of [...cases, ...temps]){
    const out = toMetric(inp);
    assert.doesNotMatch(out, /\b(oz|ounces?|lbs?|pounds?)\b|°F|\d\s*F\b|Fahrenheit/i, `${inp} → ${out}`);
  }
});
test('fractions', () => {
  assert.equal(num('1 ½'), 1.5); assert.equal(num('1½'), 1.5); assert.equal(num('1 1/2'), 1.5); assert.equal(num('3/4'), .75);
});
test('metricRecipe keeps originals and is safe to run twice', () => {
  const r = { ingredients: [{ original: '1 lb mince' }, { original: 'TO SERVE', heading: true }, { original: '2 eggs' }], steps: ['Bake at 350°F.'] };
  const a = metricRecipe(r);
  assert.deepEqual(a.ingredients[0], { original: '450 g mince', was: '1 lb mince' });
  assert.deepEqual(a.ingredients[2], { original: '2 eggs' });
  assert.deepEqual(a.steps, ['Bake at 180°C.']);
  assert.deepEqual(a.stepsWas, ['Bake at 350°F.']);
  const b = metricRecipe({ ...r, ...a });
  assert.deepEqual(b.ingredients, a.ingredients);
  assert.deepEqual(b.steps, a.steps);
});

test('scaling: halves, doubles and triples read like a recipe', () => {
  const t = (l, k, want) => assert.equal(scaleLine(l, k), want, `${l} x${k}`);
  t('1½ cups milk', 2, '3 cups milk');
  t('1½ cups milk', 0.5, '¾ cup milk');
  t('1 can (400 g) chickpeas', 2, '2 cans (400 g) chickpeas');
  t('500 g mince', 2, '1 kg mince');
  t('750 ml stock', 3, '2.25 L stock');
  t('1 L milk', 0.5, '500 ml milk');
  t('2-3 cloves garlic', 2, '4–6 cloves garlic');
  t('Juice of 1 lemon', 2, 'Juice of 2 lemons');
  t('125 ml / ½ cup water', 2, '250 ml / 1 cup water');
  t('1 onion, diced', 3, '3 onions, diced');
  t('2 large eggs', 3, '6 large eggs');
  t('1 pinch salt', 2, '2 pinches salt');
  t('Salt and pepper', 2, 'Salt and pepper');
  t('2 tbsp soy sauce', 1, '2 tbsp soy sauce');
  assert.equal(niceQty(0.33), '⅓');
  assert.equal(niceQty(2.5), '2½');
});