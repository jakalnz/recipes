// The server function and the app must ask the AI the same thing and expect the same reply shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUCTIONS as appInstr } from '../ai.js';
import { RECIPE_SCHEMA as appSchema } from '../jsonld.js';
import { INSTRUCTIONS as fnInstr, RECIPE_SCHEMA as fnSchema, readRecipe } from '../functions/recipe-ai.js';

test('app and server function use identical instructions and schema', () => {
  assert.equal(fnInstr, appInstr);
  assert.deepEqual(fnSchema, appSchema);
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
