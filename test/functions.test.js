// The server function and the app must ask the AI the same thing and expect the same reply shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUCTIONS as appInstr, SIMPLIFY_INSTRUCTIONS as appSimp, SIMPLIFY_SCHEMA as appSimpSchema, simplifyAsk as appAsk } from '../ai.js';
import { RECIPE_SCHEMA as appSchema } from '../jsonld.js';
import { INSTRUCTIONS as fnInstr, RECIPE_SCHEMA as fnSchema, readRecipe, SIMPLIFY_INSTRUCTIONS as fnSimp, SIMPLIFY_SCHEMA as fnSimpSchema, simplifyAsk as fnAsk, simplifySteps } from '../functions/recipe-ai.js';

test('app and server function use identical instructions and schema', () => {
  assert.equal(fnInstr, appInstr);
  assert.deepEqual(fnSchema, appSchema);
  assert.equal(fnSimp, appSimp);
  assert.deepEqual(fnSimpSchema, appSimpSchema);
  const r = { title: 'Pie', ingredients: ['1 sheet pastry'], steps: ['Heat the oven to 180°C.', 'Bake.'] };
  assert.equal(fnAsk(r), appAsk(r));
});

// a stand-in for the Anthropic client, to check the request and the pause_turn loop
function fakeClient(replies){
  const calls = [];
  return { calls, beta: { messages: { create: async req => { calls.push(structuredClone(req)); return replies.shift(); } } } };
}
const recipe = { found: true, title: 'Scones', servings: '', prepTime: '', cookTime: '', ingredients: [], steps: [], notes: '', categories: [], sourceName: '', unclear: [] };

test('photo request: images first, structured output, fallbacks on', async () => {
  const c = fakeClient([{ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(recipe) }], usage: { input_tokens: 10, output_tokens: 5 } }]);
  const r = await readRecipe(c, { images: ['data:image/jpeg;base64,AAAA'] });
  assert.equal(r.recipe.title, 'Scones');
  const req = c.calls[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.messages[0].content[0].type, 'image');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.fallbacks, 'default');
  assert.equal(req.tools, undefined);
});
test('link request uses web fetch and continues after pause_turn', async () => {
  const c = fakeClient([
    { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 'x', name: 'web_fetch', input: {} }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(recipe) }] },
  ]);
  const r = await readRecipe(c, { url: 'https://example.com/r' });
  assert.equal(r.recipe.found, true);
  assert.equal(c.calls.length, 2);
  assert.equal(c.calls[0].tools[0].type, 'web_fetch_20260209');
  assert.equal(c.calls[1].messages[1].role, 'assistant');
});
test('refusals are reported, not thrown as parse errors', async () => {
  const c = fakeClient([{ stop_reason: 'refusal', content: [] }]);
  assert.deepEqual(await readRecipe(c, { text: 'x' }), { error: 'refused' });
});
test('simplify request: ingredients and numbered steps in, prep and phases out, no tools', async () => {
  const reply = { prep: ['Heat oven to 180°C.'], phases: [{ heading: 'Bake', steps: ['Bake 20 minutes.'] }] };
  const c = fakeClient([{ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 9, output_tokens: 4 } }]);
  const r = await simplifySteps(c, { title: 'Pie', ingredients: ['1 sheet pastry'], steps: ['First, you will want to heat your oven to 180°C, which is important.', 'Bake it for 20 minutes.'] });
  assert.deepEqual(r.simple, reply);
  assert.deepEqual(r.usage, { input: 9, output: 4 });
  const req = c.calls[0];
  assert.equal(req.system, fnSimp);
  assert.deepEqual(req.output_config.format.schema, fnSimpSchema);
  assert.match(req.messages[0].content[0].text, /INGREDIENTS:\n1 sheet pastry[\s\S]*1\. First, you will want/);
  assert.equal(req.tools, undefined);
});
