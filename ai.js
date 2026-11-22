// AI for reading recipes from photos, pasted text and links. Works with:
//   Claude (official Anthropic SDK, loaded on demand), any OpenAI-compatible service, Google Gemini,
//   or no key at all: copy a prompt into any chatbot and paste its reply back.
// Settings live on this phone only (localStorage "rx.ai").
import { RECIPE_SCHEMA, parseLooseJson } from './jsonld.js';
import { cleanSimple } from './simplify.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.4.0/+esm';
export const CLAUDE_MODELS = [['claude-opus-5-5', 'Claude Opus 5.5 (best, a few cents a recipe)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (much cheaper)']];
export const PROVIDERS = { anthropic: 'Claude (Anthropic)', openai: 'OpenAI-compatible (ChatGPT, OpenRouter, Groq, Ollama…)', gemini: 'Google Gemini' };

export function getAi(){
  try { return JSON.parse(localStorage.getItem('rx.ai') || 'null') || {}; } catch { return {}; }
}
export function setAi(v){ try { v ? localStorage.setItem('rx.ai', JSON.stringify(v)) : localStorage.removeItem('rx.ai'); } catch {} }
// The family's shared key (a Firebase function), used when this phone has no key of its own.
let family = null;
export const setFamilyAi = fn => { family = fn; };
const ownKey = a => !!(a.provider && a.key && (a.provider === 'anthropic' || a.model));
export const usingFamily = (a = getAi()) => !ownKey(a) && !!family;
export const aiReady = (a = getAi()) => ownKey(a) || !!family;
export const canReadLinks = (a = getAi()) => ownKey(a) ? a.provider === 'anthropic' : !!family;

export const INSTRUCTIONS = `You turn recipes into structured data for a family recipe app in New Zealand.
Copy the recipe faithfully: keep every quantity and unit exactly as written (the app converts units itself), keep the cook's own wording, and never invent amounts that are not there.
Put each ingredient in its own item. If the ingredients are in groups, add the group name as its own item ending with a colon, for example "For the icing:".
Put each method step in its own item, without numbers.
If a photo is of a handwritten card or a page that is hard to read, give your best reading and list anything you are unsure of in "unclear".
If there is no recipe, set "found" to false and leave the other fields empty.`;

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
// for the no-key route
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
export const swapPrompt = input => `${SWAP_INSTRUCTIONS}\n\nReply with only JSON in exactly this shape, nothing else:\n{"swaps": [{"ingredient": "...", "swap": "...", "tip": ""}]}\n\n${swapAsk(input)}`;
export const simplifyPrompt = r => `${SIMPLIFY_INSTRUCTIONS}\n\nReply with only JSON in exactly this shape, nothing else:\n{"prep": ["..."], "phases": [{"heading": "...", "steps": ["..."]}]}\n\n${simplifyAsk(r)}`;

const EXAMPLE = { found: true, title: '', servings: '', prepTime: '', cookTime: '', ingredients: ['...'], steps: ['...'], notes: '', categories: ['Dinner'], sourceName: '', unclear: [] };
// for the no-key route: paste into ChatGPT, Gemini, Claude, Copilot …
export function copyPrompt(kind, { url = '', text = '' } = {}){
  const what = kind === 'photo' ? 'the recipe in the photo(s) I have attached'
    : kind === 'url' ? `the recipe on this web page: ${url}`
    : 'the recipe below';
  return `${INSTRUCTIONS}\n\nPlease read ${what}. Reply with only JSON in exactly this shape, nothing else:\n${JSON.stringify(EXAMPLE, null, 1)}`
    + (kind === 'text' ? `\n\nRECIPE:\n${text}` : '');
}

// input: { images?: [dataURL], text?: string, url?: string }  →  parsed recipe JSON (RECIPE_SCHEMA shape)
export async function extractRecipe(input, a = getAi()){
  if (!aiReady(a)) throw new Error('AI is not set up on this phone. Add a key in Settings, or use Copy prompt.');
  if (usingFamily(a)) return family(input);
  const ask = input.url ? `Read the recipe on this web page: ${input.url}`
    : input.text ? `Read this recipe:\n\n${input.text}` : `Read the recipe in ${input.images?.length > 1 ? 'these photos (they are pages of the same recipe)' : 'this photo'}.`;
  return ownAi(a, ask, input, INSTRUCTIONS, RECIPE_SCHEMA);
}
function ownAi(a, ask, input, system, schema){
  if (a.provider === 'anthropic') return claude(a, ask, input, system, schema);
  if (a.provider === 'openai') return openAiCompatible(a, ask, input, system, schema);
  if (a.provider === 'gemini') return gemini(a, ask, input, system, schema);
  throw new Error('Unknown AI provider');
}

// a shorter, plainer method: { title, ingredients: [line], steps: [line] } → { prep, phases }
export async function simplifySteps(r, a = getAi()){
  if (!aiReady(a)) throw new Error('AI is not set up on this phone.');
  const input = { title: r.title || '', ingredients: r.ingredients || [], steps: r.steps || [] };
  const j = usingFamily(a) ? await family({ task: 'simplify', ...input })
    : await ownAi(a, simplifyAsk(input), {}, SIMPLIFY_INSTRUCTIONS, SIMPLIFY_SCHEMA);
  const s = cleanSimple(j);
  if (!s) throw new Error("The AI didn't send back a method.");
  return s;
}

// input: { title, ingredients: [line], avoid: [line] } → [{ ingredient, swap, tip }]
export async function swapIdeas(input, a = getAi()){
  if (!aiReady(a)) throw new Error('AI is not set up on this phone.');
  const j = usingFamily(a) ? await family({ task: 'swaps', ...input }) : await ownAi(a, swapAsk(input), {}, SWAP_INSTRUCTIONS, SWAP_SCHEMA);
  return cleanSwaps(j);
}
export const cleanSwaps = j => (Array.isArray(j?.swaps) ? j.swaps : [])
  .map(s => ({ ingredient: String(s?.ingredient ?? '').trim(), swap: String(s?.swap ?? '').trim(), tip: String(s?.tip ?? '').trim() }))
  .filter(s => s.ingredient && s.swap && s.swap.toLowerCase() !== s.ingredient.toLowerCase());

const split = d => { const m = String(d).match(/^data:([^;]+);base64,(.*)$/); return m ? { type: m[1], data: m[2] } : null; };

async function claude(a, ask, input, system, schema){
  const { default: Anthropic } = await import(SDK_URL);
  // the key belongs to this phone's owner; it goes only to Anthropic
  const client = new Anthropic({ apiKey: a.key, dangerouslyAllowBrowser: true });
  const model = a.model || CLAUDE_MODELS[0][0];
  const content = [...(input.images || []).map(split).filter(Boolean).map(img => ({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } })),
    { type: 'text', text: ask }];
  let messages = [{ role: 'user', content }];
  const req = {
    model, max_tokens: 16000, system,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    ...(input.url ? { tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 }] } : {}),
    // Claude Opus 5.5: if it declines on a safety false-positive, the API retries on another model in the same call
    ...(model === 'claude-opus-5-5' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  };
  try {
    for (let turn = 0; turn < 5; turn++){
      const res = await client.beta.messages.create({ ...req, messages });
      if (res.stop_reason === 'pause_turn'){ messages = [...messages, { role: 'assistant', content: res.content }]; continue; }   // web fetch still working
      if (res.stop_reason === 'refusal') throw new Error('The AI declined to read this one. Try the Copy prompt route instead.');
      if (res.stop_reason === 'max_tokens') throw new Error('The recipe was too long to read in one go.');
      const fetchErr = res.content.find(b => b.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_tool_result_error');
      const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
      if (!text && fetchErr) throw new Error(`Couldn't open that page (${fetchErr.content.error_code}). Try the browser button instead.`);
      return JSON.parse(text);
    }
    throw new Error('The AI took too long. Try again.');
  } catch (e){
    if (e instanceof Anthropic.AuthenticationError) throw new Error('The Claude key was rejected. Check it in Settings.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error("This Claude key isn't allowed to do that. Check the key's workspace in the Claude Console.");
    if (e instanceof Anthropic.RateLimitError) throw new Error('Too many requests, or the spend limit was reached. Try again later.');
    if (e instanceof Anthropic.BadRequestError) throw new Error(`Claude couldn't take that request: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new Error('No connection to Claude. Check the internet.');
    if (e instanceof Anthropic.APIError) throw new Error(`Claude error ${e.status ?? ''}: ${e.message}`);
    throw e;
  }
}

async function openAiCompatible(a, ask, input, system, schema){
  const base = (a.base || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const content = [{ type: 'text', text: ask }, ...(input.images || []).map(url => ({ type: 'image_url', image_url: { url } }))];
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.key}` },
    body: JSON.stringify({ model: a.model, messages: [{ role: 'system', content: system }, { role: 'user', content }],
      response_format: { type: 'json_schema', json_schema: { name: 'reply', strict: true, schema } } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 401 ? 'The key was rejected. Check it in Settings.' : `AI error ${r.status}: ${j.error?.message || ''}`);
  return parseLooseJson(j.choices?.[0]?.message?.content || '');
}

async function gemini(a, ask, input, system, schema){
  const parts = [{ text: ask }, ...(input.images || []).map(split).filter(Boolean).map(img => ({ inline_data: { mime_type: img.type, data: img.data } }))];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(a.model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': a.key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system + (schema === RECIPE_SCHEMA ? '' : '\nReply with only JSON like {"prep": ["..."], "phases": [{"heading": "...", "steps": ["..."]}]}.') }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json' } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 400 || r.status === 403 ? `Gemini didn't accept the key or model: ${j.error?.message || ''}` : `Gemini error ${r.status}`);
  return parseLooseJson((j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''));
}

// shrink a photo (a File, or a data URL already in the app) to a JPEG data URL
export function resizeImage(file, max = 1600, q = 0.85){
  return new Promise((res, rej) => {
    const own = typeof file !== 'string', img = new Image(), url = own ? URL.createObjectURL(file) : file;
    const done = () => { if (own) URL.revokeObjectURL(url); };
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      done(); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { done(); rej(new Error("Couldn't open that photo.")); };
    img.src = url;
  });
}
