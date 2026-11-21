// Same instructions and reply shape as the app's ai.js / jsonld.js (a test checks they stay identical).
export const INSTRUCTIONS = `You turn recipes into structured data for a family recipe app in New Zealand.
Copy the recipe faithfully: keep every quantity and unit exactly as written (the app converts units itself), keep the cook's own wording, and never invent amounts that are not there.
Put each ingredient in its own item. If the ingredients are in groups, add the group name as its own item ending with a colon, for example "For the icing:".
Put each method step in its own item, without numbers.
If a photo is of a handwritten card or a page that is hard to read, give your best reading and list anything you are unsure of in "unclear".
If there is no recipe, set "found" to false and leave the other fields empty.`;

export const RECIPE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['found', 'title', 'servings', 'prepTime', 'cookTime', 'ingredients', 'steps', 'notes', 'categories', 'sourceName', 'unclear'],
  properties: {
    found: { type: 'boolean', description: 'false if there is no recipe in what was given' },
    title: { type: 'string' },
    servings: { type: 'string', description: 'as written, e.g. "Serves 4-6" or "12 muffins"; empty if not given' },
    prepTime: { type: 'string' }, cookTime: { type: 'string' },
    ingredients: { type: 'array', items: { type: 'string' }, description: 'one ingredient per item, exactly as written; a group heading as its own item ending in a colon, e.g. "For the sauce:"' },
    steps: { type: 'array', items: { type: 'string' }, description: 'one step per item, as written, without numbering' },
    notes: { type: 'string', description: 'tips, variations or a short description; empty if none' },
    categories: { type: 'array', items: { type: 'string' }, description: 'from: Breakfast, Lunch, Dinner, Baking, Desserts, Snacks, Sides, Salads, Soups, Drinks, Sauces' },
    sourceName: { type: 'string', description: 'book, website or person it came from, if shown' },
    unclear: { type: 'array', items: { type: 'string' }, description: 'words or amounts you could not read with confidence (handwriting, blur); empty if none' },
  },
};

export const MODEL = 'claude-opus-5-5';

// input: { images?: [dataURL], text?: string, url?: string }  → recipe JSON. `client` is an Anthropic SDK client.
export async function readRecipe(client, input){
  const ask = input.url ? `Read the recipe on this web page: ${input.url}`
    : input.text ? `Read this recipe:\n\n${input.text}` : `Read the recipe in ${input.images?.length > 1 ? 'these photos (they are pages of the same recipe)' : 'this photo'}.`;
  const images = (input.images || []).map(d => String(d).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/)).filter(Boolean)
    .map(m => ({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }));
  let messages = [{ role: 'user', content: [...images, { type: 'text', text: ask }] }];
  const req = {
    model: MODEL, max_tokens: 16000, system: INSTRUCTIONS,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
    ...(input.url ? { tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 }] } : {}),
    // if Claude Opus 5.5 declines on a safety false-positive, the API retries on another model in the same call
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
  };
  for (let turn = 0; turn < 5; turn++){
    const res = await client.beta.messages.create({ ...req, messages });
    if (res.stop_reason === 'pause_turn'){ messages = [...messages, { role: 'assistant', content: res.content }]; continue; }
    if (res.stop_reason === 'refusal') return { error: 'refused' };
    if (res.stop_reason === 'max_tokens') return { error: 'too-long' };
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const fetchErr = res.content.find(b => b.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_tool_result_error');
    if (!text && fetchErr) return { error: 'fetch', code: fetchErr.content.error_code };
    return { recipe: JSON.parse(text), usage: { input: res.usage?.input_tokens || 0, output: res.usage?.output_tokens || 0 } };
  }
  return { error: 'timeout' };
}
