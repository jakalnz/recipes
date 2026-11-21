// Firestore rules tests. Run with: npm run test:rules  (needs Java for the emulator)
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let env;
const SHOP_A = 'shop-a@example.com', SHOP_B = 'shop-b@example.com';
const AUNT = 'aunt@example.com', STRANGER = 'stranger@example.com';
const users = {
  shopA:    { uid: 'shopA', email: SHOP_A },
  shopB:    { uid: 'shopB', email: SHOP_B },
  aunt:     { uid: 'aunt',  email: AUNT },
  stranger: { uid: 'stranger', email: STRANGER },
  unverified: { uid: 'unv', email: SHOP_A, verified: false },
};
const as = k => {
  const u = users[k];
  return env.authenticatedContext(u.uid, { email: u.email, email_verified: u.verified !== false }).firestore();
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-rules-test',   // separate from the dev data used by npm run emu
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'access/family'), {
      shop: [SHOP_A, SHOP_B],
      members: { [SHOP_A]: 'hh1', [SHOP_B]: 'hh1', [AUNT]: 'hh2' },
    });
    await setDoc(doc(db, 'items/milk'), { name: 'Milk', onList: true });
    await setDoc(doc(db, 'meta/settings'), { cats: ['Dairy'] });
    await setDoc(doc(db, 'photos/milk'), { data: 'x' });
    await setDoc(doc(db, 'rxRecipes/r1'), { title: 'Lasagne', createdBy: { uid: 'aunt', name: 'Aunt' } });
    await setDoc(doc(db, 'rxPlans/hh1/days/2026-11-24'), { meals: {} });
    await setDoc(doc(db, 'rxPlans/hh2/days/2026-11-24'), { meals: {} });
  });
});

// ---- Shop keeps working for the Shop household ----
test('Shop accounts read and write Shop collections', async () => {
  await assertSucceeds(getDocs(collection(as('shopA'), 'items')));
  await assertSucceeds(updateDoc(doc(as('shopB'), 'items/milk'), { ticked: true }));
  await assertSucceeds(setDoc(doc(as('shopA'), 'stores/default'), { name: 'Supermarket' }));
  await assertSucceeds(getDoc(doc(as('shopA'), 'meta/settings')));
  await assertSucceeds(setDoc(doc(as('shopA'), 'trips/t1'), { at: 1 }));
  await assertSucceeds(setDoc(doc(as('shopA'), 'presence/shopA'), { at: 1 }));
  await assertSucceeds(getDoc(doc(as('shopA'), 'photos/milk')));
});

// ---- Other family members and strangers cannot touch Shop ----
test('another household is refused on Shop data', async () => {
  await assertFails(getDocs(collection(as('aunt'), 'items')));
  await assertFails(getDoc(doc(as('aunt'), 'items/milk')));
  await assertFails(updateDoc(doc(as('aunt'), 'items/milk'), { ticked: true }));
  await assertFails(getDoc(doc(as('aunt'), 'meta/settings')));
  await assertFails(getDoc(doc(as('aunt'), 'photos/milk')));
});
test('strangers, unverified and signed-out users are refused everywhere', async () => {
  for (const db of [as('stranger'), as('unverified'), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(db, 'items/milk')));
    await assertFails(getDoc(doc(db, 'rxRecipes/r1')));
    await assertFails(getDoc(doc(db, 'access/family')));
  }
});

// ---- access list ----
test('only Shop accounts can change the access list', async () => {
  await assertSucceeds(getDoc(doc(as('aunt'), 'access/family')));
  await assertFails(updateDoc(doc(as('aunt'), 'access/family'), { shop: [SHOP_A, SHOP_B, AUNT] }));
  await assertSucceeds(updateDoc(doc(as('shopA'), 'access/family'), { shop: [SHOP_A, SHOP_B] }));
});

// ---- Recipes library is shared ----
test('family members read, add and edit recipes', async () => {
  await assertSucceeds(getDoc(doc(as('shopA'), 'rxRecipes/r1')));
  await assertSucceeds(setDoc(doc(as('aunt'), 'rxRecipes/r2'), { title: 'Scones', createdBy: { uid: 'aunt', name: 'Aunt' } }));
  await assertFails(setDoc(doc(as('aunt'), 'rxRecipes/r3'), { title: 'Fake', createdBy: { uid: 'shopA', name: 'X' } }));
  await assertSucceeds(updateDoc(doc(as('shopA'), 'rxRecipes/r1'), { notes: 'Less salt' }));
  await assertFails(updateDoc(doc(as('shopA'), 'rxRecipes/r1'), { createdBy: { uid: 'shopA', name: 'X' } }));
});
test('family can store recipe photos, strangers and Shop-only paths cannot', async () => {
  await assertSucceeds(setDoc(doc(as('aunt'), 'rxPhotos/r1'), { data: 'data:image/jpeg;base64,AAAA' }));
  await assertSucceeds(getDoc(doc(as('shopA'), 'rxPhotos/r1')));
  await assertFails(setDoc(doc(as('aunt'), 'rxPhotos/r2'), { data: 42 }));
  await assertFails(getDoc(doc(as('stranger'), 'rxPhotos/r1')));
});
test('anyone in the family can rate a recipe without changing who added it', async () => {
  await assertSucceeds(updateDoc(doc(as('shopA'), 'rxRecipes/r1'), { 'stars.shopA': 4 }));
});
test('ratings are per person', async () => {
  await assertSucceeds(setDoc(doc(as('aunt'), 'rxRecipes/r1/ratings/aunt'), { stars: 5 }));
  await assertFails(setDoc(doc(as('aunt'), 'rxRecipes/r1/ratings/shopA'), { stars: 1 }));
});

// ---- Plans are private to each household ----
test('a household cannot read or edit another household plan', async () => {
  await assertSucceeds(getDoc(doc(as('aunt'), 'rxPlans/hh2/days/2026-11-24')));
  await assertFails(getDoc(doc(as('aunt'), 'rxPlans/hh1/days/2026-11-24')));
  await assertFails(setDoc(doc(as('aunt'), 'rxPlans/hh1/days/2026-11-25'), { meals: {} }));
  await assertSucceeds(setDoc(doc(as('shopA'), 'rxPlans/hh1/days/2026-11-25'), { meals: {} }));
});

// ---- Dietary profiles: readable by family, edited by their own household ----
test('dietary profiles are managed by their household', async () => {
  const dad = { name: 'Dad', household: 'hh2', custom: [{ item: 'cabbage', level: 'upset' }] };
  await assertSucceeds(setDoc(doc(as('aunt'), 'rxPeople/dad'), dad));
  await assertSucceeds(getDoc(doc(as('shopA'), 'rxPeople/dad')));
  await assertSucceeds(updateDoc(doc(as('aunt'), 'rxPeople/dad'), { presets: ['whipple'] }));
  await assertFails(setDoc(doc(as('aunt'), 'rxPeople/kid'), { name: 'Kid', household: 'hh1' }));
  await assertFails(updateDoc(doc(as('aunt'), 'rxPeople/dad'), { household: 'hh1' }));
  await assertSucceeds(setDoc(doc(as('shopA'), 'rxPeople/kid'), { name: 'Kid', household: 'hh1' }));
  await assertFails(updateDoc(doc(as('aunt'), 'rxPeople/kid'), { presets: ['vegan'] }));
  await assertFails(deleteDoc(doc(as('aunt'), 'rxPeople/kid')));
  await assertFails(getDoc(doc(as('stranger'), 'rxPeople/dad')));
});

// ---- Family meals are shared ----
test('family meals are open to the family', async () => {
  await assertSucceeds(setDoc(doc(as('aunt'), 'rxFamilyMeals/xmas'), { host: 'hh2', date: '2026-12-25' }));
  await assertSucceeds(updateDoc(doc(as('shopA'), 'rxFamilyMeals/xmas'), { 'rsvp.hh1': 4 }));
  await assertSucceeds(deleteDoc(doc(as('aunt'), 'rxFamilyMeals/xmas')));
});

// ---- Usage counters are function-only ----
test('nobody can write their own AI usage counter', async () => {
  await assertFails(setDoc(doc(as('aunt'), 'rxUsage/aunt'), { n: 0 }));
});

