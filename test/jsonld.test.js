import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoDuration, findRecipe, fromJsonLd, fromAi, parseLooseJson } from '../jsonld.js';

test('durations', () => {
  assert.equal(isoDuration('PT1H20M'), '1 hr 20 min');
  assert.equal(isoDuration('PT45M'), '45 min');
  assert.equal(isoDuration('P0DT2H'), '2 hr');
});
test('finds the Recipe inside @graph and arrays', () => {
  const ld = [{ '@type': 'WebSite' }, { '@graph': [{ '@type': 'BreadcrumbList' }, { '@type': ['Recipe', 'NewsArticle'], name: 'Pavlova' }] }];
  assert.equal(findRecipe(ld).name, 'Pavlova');
  assert.equal(findRecipe({ '@type': 'Article' }), null);
});
test('maps a typical recipe site', () => {
  const r = fromJsonLd({
    '@type': 'Recipe', name: 'Lamb &amp; Kumara Stew', recipeYield: ['6', '6 servings'], prepTime: 'PT20M', cookTime: 'PT1H30M',
    recipeCategory: 'Dinner', recipeCuisine: 'New Zealand', image: [{ url: 'https://x.nz/a.jpg' }],
    recipeIngredient: ['1 kg lamb shoulder', '2 kumara, peeled'],
    recipeInstructions: [{ '@type': 'HowToSection', name: 'Stew', itemListElement: [{ '@type': 'HowToStep', text: 'Brown the lamb.' }, { '@type': 'HowToStep', text: 'Simmer 1 hour.' }] }],
    author: { '@type': 'Person', name: 'Aunty Jo' },
  }, 'https://x.nz/stew');
  assert.equal(r.title, 'Lamb & Kumara Stew');
  assert.equal(r.servings, 6);
  assert.equal(r.cookTime, '1 hr 30 min');
  assert.deepEqual(r.cats, ['Dinner']);
  assert.deepEqual(r.tags, ['New Zealand']);
  assert.equal(r.ingredients.length, 2);
  assert.deepEqual(r.steps, ['Stew:', 'Brown the lamb.', 'Simmer 1 hour.']);
  assert.equal(r.photoUrl, 'https://x.nz/a.jpg');
  assert.equal(r.source.name, 'Aunty Jo');
});
test('instructions given as one HTML string', () => {
  const r = fromJsonLd({ '@type': 'Recipe', name: 'X', recipeIngredient: [], recipeInstructions: '<p>Mix it.</p><p>Bake it.</p>' });
  assert.deepEqual(r.steps, ['Mix it.', 'Bake it.']);
});
test('AI replies, with or without code fences', () => {
  const j = parseLooseJson('Here you go:\n```json\n{"found":true,"title":"Nana\'s scones","servings":"Makes 12","prepTime":"","cookTime":"12 min","ingredients":["3 cups flour","For the top:","milk"],"steps":["1. Mix","2. Bake"],"notes":"","categories":["Baking"],"sourceName":"Nana","unclear":["1 or 2 tsp?"]}\n```');
  const r = fromAi(j);
  assert.equal(r.title, "Nana's scones");
  assert.equal(r.servings, 12);
  assert.deepEqual(r.steps, ['Mix', 'Bake']);
  assert.equal(r.ingredients[1].heading, true);
  assert.deepEqual(r.unclear, ['1 or 2 tsp?']);
  assert.throws(() => parseLooseJson('sorry, no recipe'), /Couldn't find/);
});
