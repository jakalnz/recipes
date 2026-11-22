import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSimple, numbersIn, missingNumbers, highlight } from '../simplify.js';

test('cleanSimple tidies numbering and drops empty phases', () => {
  const s = cleanSimple({ prep: ['1. Heat oven to 180°C.', ''], phases: [{ heading: 'Bake:', steps: ['2) Bake 20 minutes.'] }, { heading: 'Empty', steps: [] }] });
  assert.deepEqual(s, { prep: ['Heat oven to 180°C.'], phases: [{ heading: 'Bake', steps: ['Bake 20 minutes.'] }] });
  assert.equal(cleanSimple({ prep: ['x'], phases: [] }), null);
  assert.equal(cleanSimple(null), null);
});

test('numbersIn reads units, ranges and fractions', () => {
  assert.deepEqual(numbersIn('Bake at 180 °C for 20–25 mins in a 23cm tin, ½ the mix').map(n => n.num + n.unit),
    ['180°c', '20-25min', '23cm', '½']);
});

test('missingNumbers finds dropped temperatures and times, ignores wording changes', () => {
  const steps = ['Preheat the oven to 180°C.', 'Bake for 20 to 25 minutes until golden.', 'Rest 5 minutes.'];
  const ok = { prep: ['Heat oven to 180 °C.'], phases: [{ heading: 'Bake', steps: ['Bake 20-25 mins, until golden.', 'Rest 5 min.'] }] };
  assert.deepEqual(missingNumbers(steps, ok), []);
  const bad = { prep: ['Heat the oven.'], phases: [{ heading: 'Bake', steps: ['Bake 20-25 minutes.', 'Rest 10 minutes.'] }] };
  assert.deepEqual(missingNumbers(steps, bad), ['180°C', '5 minutes']);
});

test('extra amounts added from the ingredient list are fine', () => {
  assert.deepEqual(missingNumbers(['Add the seasoning.'], { prep: [], phases: [{ heading: 'Cook', steps: ['Add the 2 tbsp seasoning.'] }] }), []);
});

test('highlight bolds key details and stays safe HTML', () => {
  assert.equal(highlight('Bake at 180°C for 20 minutes until golden, then cool.'),
    'Bake at <b>180°C</b> for <b>20 minutes</b> <b>until golden</b>, then cool.');
  assert.equal(highlight('Add 1 can (400 g) beans and 2 tbsp oil to a 23 cm pan'),
    'Add <b>1 can (400 g)</b> beans and <b>2 tbsp</b> oil to a <b>23 cm</b> pan');
  assert.equal(highlight("Stir until it's thick <b>"), 'Stir <b>until it&#39;s thick &lt;b&gt;</b>');
});
