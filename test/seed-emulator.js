// Seeds the local Firestore emulator with a pretend family so the app can be tried at http://localhost:5173/?emu
// Run while `npm run emu` is going:  node test/seed-emulator.js
const base = 'http://127.0.0.1:8181/v1/projects/demo-recipes/databases/(default)/documents';
const H = { 'content-type': 'application/json', Authorization: 'Bearer owner' };
const str = v => ({ stringValue: v });
const map = o => ({ mapValue: { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? str(v) : v])) } });
const arr = a => ({ arrayValue: { values: a.map(x => typeof x === 'string' ? str(x) : x) } });

async function put(path, fields){
  const r = await fetch(`${base}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
}
await put('access/family', {
  shop: arr(['shop.one@example.com']),
  members: map({ 'shop.one@example.com': 'hh1', 'aunt.test@example.com': 'hh2' }),
  households: map({ hh1: 'Our place', hh2: 'Mum and Dad' }),
});
await put('rxPeople/dad', { name: str('Dad'), household: str('hh2'), presets: arr(['whipple']), presetOff: arr([]),
  custom: arr([map({ item: 'cabbage', level: 'upset' })]), showConditions: { booleanValue: true } });
await put('rxRecipes/coleslaw', { title: str('Crunchy coleslaw'), cats: arr(['Salads', 'Sides']), servings: { integerValue: '6' },
  ingredients: arr(['½ red cabbage, finely sliced', '2 carrots, grated', '½ cup mayonnaise', '1 tbsp cider vinegar'].map(o => map({ original: o }))),
  steps: arr(['Toss the cabbage and carrot.', 'Mix the mayonnaise and vinegar, then stir through.']),
  createdBy: map({ uid: 'seed', name: 'Seed' }) });
// a pretend Shop list for the Shop household (same fields Shop uses)
await put('meta/settings', { cats: arr(['Fruit & Veg', 'Bakery', 'Meat & Fish', 'Deli & Chilled', 'Dairy & Eggs', 'Frozen', 'Pantry', 'Tins & Jars', 'Snacks', 'Drinks', 'Other']) });
for (const [id, name, cat, onList, ticked] of [['eggs', 'Eggs', 'Dairy & Eggs', false, false], ['onion', 'Onion', 'Fruit & Veg', false, false],
  ['garlic', 'Garlic', 'Fruit & Veg', true, true], ['milk', 'Milk', 'Dairy & Eggs', true, false]])
  await put(`items/${id}`, { name: str(name), cat: str(cat), misc: { booleanValue: false }, onList: { booleanValue: onList }, ticked: { booleanValue: ticked },
    qty: str(''), note: str(onList ? 'the blue one' : ''), count: { integerValue: '3' }, pos: map({}) });
// pack sizes: one with a size, one without (fill it in), a brand name to confirm, a multipack, a per-kg item and a one-off
const num = n => ({ doubleValue: n });
for (const [id, name, cat, extra] of [['blackbeans', 'Black beans (can)', 'Tins & Jars', { size: str('400g'), packG: num(400) }],
  ['chickpeas', 'Chickpeas', 'Tins & Jars', {}], ['coco', 'Pams coconut cream', 'Tins & Jars', { size: str('400ml'), packMl: num(400) }],
  ['tomcan', 'Chopped tomatoes', 'Tins & Jars', { size: str('4x400g'), packG: num(1600) }], ['mince', 'Beef mince', 'Meat & Fish', { unit: str('kg') }],
  ['kidney', 'Kidney beans', 'Tins & Jars', { misc: { booleanValue: true }, size: str('420g'), packG: num(420) }]])
  await put(`items/${id}`, { name: str(name), cat: str(cat), misc: { booleanValue: false }, onList: { booleanValue: false }, ticked: { booleanValue: false },
    qty: str(''), note: str(''), count: { integerValue: '1' }, pos: map({}), ...extra });
await put('rxRecipes/chilli', { title: str('Black bean chilli'), cats: arr(['Mains']), servings: { integerValue: '4' },
  ingredients: arr(['500 g beef mince', '1 onion, diced', '1 can black beans, drained and rinsed', '1 can chickpeas, drained', '½ can coconut cream',
    '1 tin chopped tomatoes', '1 can red kidney beans'].map(o => map({ original: o }))),
  steps: arr(['Brown the mince and onion.', 'Add everything else and simmer for 20 minutes.']),
  createdBy: map({ uid: 'seed', name: 'Seed' }) });
console.log('Seeded: sign in as shop.one@example.com (Shop + admin) or aunt.test@example.com (another household).');
