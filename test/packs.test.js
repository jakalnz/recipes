import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packKey, packOf, matchPack, entryOf, sameEntry, perKg } from '../packs.js';

const items = [
  { id: 'a', name: 'Black beans (can)', cat: 'Pantry', size: '400g', packG: 400 },
  { id: 'b', name: 'Chickpeas', cat: 'Pantry' },                                   // no pack size yet
  { id: 'c', name: 'Pams coconut cream', cat: 'Pantry', size: '400ml', packMl: 400 },
  { id: 'd', name: 'Tomatoes', cat: 'Fruit & Veg', packG: 500 },                    // weighed: no pack
  { id: 'e', name: 'Lemonade', cat: 'Drinks', size: '6x375ml', packMl: 2250 },
  { id: 'f', name: 'Kidney beans', cat: 'Pantry', misc: true, packG: 420 },          // one-off: ignored
  { id: 'g', name: 'Mince', cat: 'Pantry', unit: 'kg', packG: 500 },
];

test('keys ignore pack words, brackets, sizes and plurals', () => {
  assert.equal(packKey('Black beans (can)'), 'black bean');
  assert.equal(packKey('black beans'), 'black bean');
  assert.equal(packKey('Chickpeas 400g tin'), 'chickpea');
});
test('pack size: per kg and one-off items have none, multipacks give one unit', () => {
  assert.deepEqual(packOf(items[0]), { g: 400 });
  assert.equal(packOf(items[1]), null);
  assert.deepEqual(packOf(items[2]), { ml: 400 });
  assert.equal(packOf(items[3]), null);
  assert.deepEqual(packOf(items[4]), { ml: 375 });
  assert.equal(packOf(items[5]), null);
  assert.equal(packOf(items[6]), null);
  assert.equal(perKg({ cat: 'Meat & Fish' }), true);
  assert.equal(perKg({ cat: 'Meat & Fish', unit: 'each' }), false);
});
test('matching: same name is sure, a brand or extra word needs confirming', () => {
  const m = matchPack('black bean', items);
  assert.equal(m.item.id, 'a'); assert.equal(m.sure, true);
  const c = matchPack(packKey('coconut cream'), items);
  assert.equal(c.item.id, 'c'); assert.equal(c.sure, false);
  assert.equal(matchPack('tomato', items), null);           // weighed items aren't packs
  assert.equal(matchPack('kidney bean', items), null);      // one-off items are ignored
});
test('confirmed and rejected matches are remembered', () => {
  const key = packKey('coconut cream');
  const ok = matchPack(key, items, { packs: { [key]: { id: 'c', ok: true } } });
  assert.equal(ok.sure, true); assert.equal(ok.confirmed, true);
  assert.equal(matchPack(key, items, { packNo: { [key]: ['c'] } }), null);
  // a confirmed item that was deleted from Shop falls back to matching again
  const gone = matchPack('black bean', items, { packs: { 'black bean': { id: 'zz', ok: true } } });
  assert.equal(gone.item.id, 'a'); assert.equal(gone.confirmed, false);
});
test('saved entries', () => {
  const e = entryOf({ item: items[4] }, true);
  assert.deepEqual(e, { id: 'e', name: 'Lemonade', size: '6x375ml', g: null, ml: 375, ok: true });
  assert.equal(sameEntry(e, { ...e }), true);
  assert.equal(sameEntry(e, { ...e, ml: 2250 }), false);
});
