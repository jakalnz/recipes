// Uploads data-src/foods.json into Firestore rxFoods/{meta, p0..pN} (family-only, see firestore.rules).
// Live:      node scripts/upload-foods.mjs            (uses your `firebase login`)
// Emulator:  node scripts/upload-foods.mjs --emu
import fs from 'node:fs';
const emu = process.argv.includes('--emu');
const project = emu ? 'demo-recipes' : 'shop-bf13d';
const base = emu ? `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`
                 : `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
let token = 'owner';
if (!emu){
  const cfg = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '/.config/configstore/firebase-tools.json', 'utf8'));
  token = cfg.tokens.access_token;
  if (cfg.tokens.expires_at && cfg.tokens.expires_at < Date.now()) throw new Error('Login token expired: run `firebase projects:list` once to refresh it, then try again.');
}
const table = JSON.parse(fs.readFileSync(new URL('../data-src/foods.json', import.meta.url), 'utf8'));
const CHUNK = 2500;   // foods per document, keeps each well under Firestore's 1 MB limit
const parts = [];
for (let i = 0; i < table.foods.length; i += CHUNK) parts.push(JSON.stringify(table.foods.slice(i, i + CHUNK)));
async function put(id, fields){
  const r = await fetch(`${base}/rxFoods/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`${id}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}
for (let i = 0; i < parts.length; i++){
  await put('p' + i, { foods: { stringValue: parts[i] } });
  console.log(`p${i}: ${Math.round(parts[i].length / 1024)} KB`);
}
await put('meta', {
  parts: { integerValue: String(parts.length) }, built: { stringValue: table.built }, count: { integerValue: String(table.foods.length) },
  fields: { arrayValue: { values: table.fields.map(stringValue => ({ stringValue })) } },
  sources: { mapValue: { fields: Object.fromEntries(Object.entries(table.sources).map(([k, v]) => [k, { stringValue: v }])) } },
});
console.log(`Uploaded ${table.foods.length} foods in ${parts.length} parts to ${emu ? 'the emulator' : project}.`);
