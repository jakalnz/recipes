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
console.log('Seeded: sign in as shop.one@example.com (Shop + admin) or aunt.test@example.com (another household).');
