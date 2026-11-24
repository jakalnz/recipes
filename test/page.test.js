import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLd, pageText, pageTitle, safeUrl, privateIp, readPage, findRecipe as serverFind } from '../functions/page.js';
import { findRecipe, fromJsonLd } from '../jsonld.js';

const PAGE = `<!doctype html><html><head><title>Pavlova &amp; berries | Test Kitchen</title>
<script type="application/ld+json">{ broken json </script>
<script type='application/ld+json'>{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Test Kitchen"},
 {"@type":["Recipe"],"name":"Pavlova","recipeIngredient":["4 egg whites","1 cup caster sugar"],
  "recipeInstructions":[{"@type":"HowToStep","text":"Whisk the whites."},{"@type":"HowToStep","text":"Bake at 120°C for 1 hour."}],
  "review":[{"reviewBody":"great"}],"aggregateRating":{"ratingValue":5}}]}</script>
<style>.x{color:red}</style></head><body><nav>Home</nav><p>Hello</p><script>var x = 1;</script></body></html>`;

test('finds the recipe data past broken JSON-LD, inside @graph, without reviews', () => {
  const ld = extractLd(PAGE);
  assert.equal(ld.name, 'Pavlova');
  assert.equal(ld.review, undefined);
  assert.equal(ld.aggregateRating, undefined);
  // the app turns it into a draft the same way as the browser button does
  const d = fromJsonLd(findRecipe(ld), 'https://example.com/pav');
  assert.deepEqual(d.steps, ['Whisk the whites.', 'Bake at 120°C for 1 hour.']);
  assert.equal(pageTitle(PAGE), 'Pavlova & berries | Test Kitchen');
});
test('the server copy of findRecipe matches the app one', () => {
  const ld = [{ '@type': 'WebSite' }, { mainEntity: { '@type': 'Recipe', name: 'Scones' } }];
  assert.equal(serverFind(ld).name, findRecipe(ld).name);
  assert.equal(serverFind({ '@type': 'Article' }), null);
});
test('a page with no recipe data gives its visible text', () => {
  const html = '<html><head><title>Nan\'s scones</title><script>track()</script></head><body><h1>Nan&#39;s scones</h1><p>3 cups flour</p><p>Bake 12 minutes</p></body></html>';
  assert.equal(extractLd(html), null);
  const t = pageText(html);
  assert.match(t, /Nan's scones\n3 cups flour\nBake 12 minutes/);
  assert.doesNotMatch(t, /track/);
});
test('only public web addresses are fetched', () => {
  for (const bad of ['file:///etc/passwd', 'ftp://example.com', 'http://localhost/x', 'http://127.0.0.1', 'http://169.254.169.254/latest',
    'http://metadata.google.internal/', 'http://10.0.0.5', 'http://192.168.1.1', 'http://[::1]/', 'http://user:pw@example.com', 'http://example.com:8080/', 'not a url'])
    assert.equal(safeUrl(bad), null, bad);
  assert.ok(safeUrl('https://www.bbcgoodfood.com/recipes/pavlova'));
  assert.ok(privateIp('::ffff:127.0.0.1'));
  assert.ok(!privateIp('8.8.8.8'));
});
test('readPage follows redirects, checks each hop, and reports blocked sites', async () => {
  const res = (status, body = '', headers = {}) => new Response(body, { status, headers });
  const pages = { 'https://8.8.8.8/a': res(301, '', { location: '/b' }), 'https://8.8.8.8/b': res(200, PAGE) };
  const ok = await readPage('https://8.8.8.8/a', { fetchFn: async u => pages[u] });
  assert.equal(ok.ld.name, 'Pavlova');
  assert.equal(ok.url, 'https://8.8.8.8/b');
  const sneaky = await readPage('https://8.8.8.8/a', { fetchFn: async () => res(302, '', { location: 'http://169.254.169.254/' }) });
  assert.equal(sneaky.error, 'bad-url');
  const blocked = await readPage('https://8.8.8.8/a', { fetchFn: async () => res(403) });
  assert.deepEqual(blocked, { error: 'blocked', code: 403 });
  const plain = await readPage('https://8.8.8.8/a', { fetchFn: async () => res(200, '<p>Just words</p>') });
  assert.equal(plain.ld, null);
  assert.equal(plain.text, 'Just words');
});
