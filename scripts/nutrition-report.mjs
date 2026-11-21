// Prints how every ingredient line in a Paprika export is matched and weighed. For tuning the matcher.
// usage: node scripts/nutrition-report.mjs <export.paprikarecipes> [title filter]
import fs from 'node:fs';
import { readPaprika } from '../paprika.js';
import { makeIndex, computeRecipe } from '../nutrition.js';
const idx = makeIndex(JSON.parse(fs.readFileSync(new URL('../data-src/foods.json', import.meta.url), 'utf8')));
const { recipes } = await readPaprika(fs.readFileSync(process.argv[2]));
const filt = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const tally = {};
for (const x of recipes){
  if (filt && !filt.test(x.title)) continue;
  const r = computeRecipe(x.recipe, idx);
  console.log(`\n## ${x.title} — serves ${r.servings ?? '?'} — per serving: carbs ${r.perServing?.carbs.toFixed(1)} g, fat ${r.perServing?.fat.toFixed(1)} g, ${Math.round(r.servingGrams || 0)} g`);
  for (const l of r.lines){
    tally[l.status] = (tally[l.status] || 0) + 1;
    console.log(`  [${l.status.padEnd(9)}] ${l.text.slice(0, 55).padEnd(55)} → ${l.food ? `${l.food.id} ${l.food.name.slice(0, 45)}` : '—'}${l.grams != null ? ` | ${Math.round(l.grams)} g (${l.how})` : l.how ? ` | ${l.how}` : ''}`);
  }
}
console.log('\n', JSON.stringify(tally));
