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

// Shortening a wordy method (the app and the server function ask the same; a test checks they match).
// Shape follows research on written instructions: prep first, short labelled phases, amounts in the steps.
export const SIMPLIFY_INSTRUCTIONS = `You rewrite a recipe's method so it is quick to follow while cooking, for a family recipe app in New Zealand.
Put jobs that can be done before cooking starts in "prep" as short items: heating the oven, greasing or lining tins, chopping, measuring, draining, softening. Only include jobs this recipe needs.
Group the remaining steps, in order, into a few phases, each with a heading of two to four words, such as "Make the sauce" or "Bake".
Start each step with the action. Put one action, or a few closely linked actions, in each step.
When a step uses an ingredient, include its amount from the ingredient list, for example "Add the 2 tbsp burrito seasoning". If the recipe splits an ingredient across steps, give only the part used in that step.
Keep every temperature, time, tin or dish size and doneness cue exactly as written, for example "180°C", "20 minutes" or "until golden".
If a step can be done while something else cooks, start it with "While".
Cut stories, chatty or repeated wording, and explanations of why. Use short, plain sentences.
Never add steps, ingredients, amounts or advice that are not in the recipe. Give the steps without numbers.`;
export const SIMPLIFY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['prep', 'phases'],
  properties: {
    prep: { type: 'array', items: { type: 'string' }, description: 'jobs to do before cooking starts; empty if none' },
    phases: { type: 'array', description: 'the method in order, in a few short phases', items: {
      type: 'object', additionalProperties: false, required: ['heading', 'steps'],
      properties: { heading: { type: 'string', description: 'two to four words' }, steps: { type: 'array', items: { type: 'string' }, description: 'steps without numbering' } },
    } },
  },
};
export const simplifyAsk = ({ title = '', ingredients = [], steps = [] }) => `Simplify the method of "${title}".\n\nINGREDIENTS:\n${ingredients.join('\n')}\n\nMETHOD:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

// Swap ideas for what people need to avoid (the app and the server function ask the same; a test checks they match).
// Only the ingredients and a plain list of things to avoid are sent: never names or health conditions.
export const SWAP_INSTRUCTIONS = `You suggest ingredient swaps for a family recipe app in New Zealand.
You are given a recipe's ingredients and a list of things some of the people eating it need to avoid or have less of.
For each ingredient line that contains something on the list, suggest one swap that keeps the dish working, using ingredients that are easy to buy in a New Zealand supermarket.
Give "ingredient" exactly as the line is written, and "swap" as the whole new line, with a sensible amount.
Check that the swap contains nothing else on the list. Put a short tip in "tip" if the cooking needs to change, for example a different time or method; otherwise leave it empty.
Leave out lines with no good swap. Do not mention medicines or doses, and do not give medical advice.`;
export const SWAP_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['swaps'],
  properties: {
    swaps: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['ingredient', 'swap', 'tip'],
      properties: {
        ingredient: { type: 'string', description: 'the ingredient line exactly as given' },
        swap: { type: 'string', description: 'the whole new ingredient line, with an amount' },
        tip: { type: 'string', description: 'a short cooking tip for the swap; empty if none' },
      },
    } },
  },
};
export const swapAsk = ({ title = '', ingredients = [], avoid = [] }) => `Suggest swaps for "${title}".\n\nAVOID OR HAVE LESS OF:\n${avoid.join('\n')}\n\nINGREDIENTS:\n${ingredients.join('\n')}`;

export const MODEL = 'claude-opus-5-5';

// input: { images?: [dataURL], text?: string, url?: string }  → recipe JSON. `client` is an Anthropic SDK client.
export async function readRecipe(client, input){
  const ask = input.url ? `Read the recipe on this web page: ${input.url}`
    : input.text ? `Read this recipe:\n\n${input.text}` : `Read the recipe in ${input.images?.length > 1 ? 'these photos (they are pages of the same recipe)' : 'this photo'}.`;
  const images = (input.images || []).map(d => String(d).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/)).filter(Boolean)
    .map(m => ({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }));
  const r = await run(client, INSTRUCTIONS, RECIPE_SCHEMA, [...images, { type: 'text', text: ask }], input.url ? [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 }] : null);
  return r.json ? { recipe: r.json, usage: r.usage } : r;
}
// input: { title, ingredients: [string], steps: [string] } → { simple: { prep, phases } }
export async function simplifySteps(client, input){
  const r = await run(client, SIMPLIFY_INSTRUCTIONS, SIMPLIFY_SCHEMA, [{ type: 'text', text: simplifyAsk(input) }]);
  return r.json ? { simple: r.json, usage: r.usage } : r;
}

// input: { title, ingredients: [string], avoid: [string] } → { swaps: { swaps: [...] } }
export async function swapIdeas(client, input){
  const r = await run(client, SWAP_INSTRUCTIONS, SWAP_SCHEMA, [{ type: 'text', text: swapAsk(input) }]);
  return r.json ? { swaps: r.json, usage: r.usage } : r;
}

async function run(client, system, schema, content, tools){
  let messages = [{ role: 'user', content }];
  const req = {
    model: MODEL, max_tokens: 16000, system,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    ...(tools ? { tools } : {}),
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
    return { json: JSON.parse(text), usage: { input: res.usage?.input_tokens || 0, output: res.usage?.output_tokens || 0 } };
  }
  return { error: 'timeout' };
}
