// Family AI: reads recipes from photos, pasted text and links with the family's shared Claude key.
// The key is a Firebase secret (ANTHROPIC_API_KEY); it never reaches anyone's phone.
// Only signed-in people on the family list (access/family) can call it, with a daily limit each.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import { readRecipe as read, simplifySteps, swapIdeas } from './recipe-ai.js';
import { readPage } from './page.js';

const KEY = defineSecret('ANTHROPIC_API_KEY');
initializeApp();
const db = getFirestore();
const NZ_DAY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });   // YYYY-MM-DD in NZ

// signed in, verified and on the family list → { email, fam }
async function familyOnly(req){
  const email = req.auth?.token?.email, verified = req.auth?.token?.email_verified;
  if (!req.auth || !email || !verified) throw new HttpsError('unauthenticated', 'Sign in first.');
  const fam = (await db.doc('access/family').get()).data() || {};
  if (!fam.members?.[email] && !(fam.shop || []).includes(email)) throw new HttpsError('permission-denied', "You're not on the family list.");
  return { email, fam };
}

// Free link reading: fetches the page and returns its recipe data (JSON-LD), or its text for the AI backup.
// No AI and no daily limit, so it works even when the family AI is off.
export const fetchRecipe = onCall({ region: 'australia-southeast1', timeoutSeconds: 30, memory: '256MiB', maxInstances: 5 }, async req => {
  await familyOnly(req);
  const url = req.data?.url;
  if (typeof url !== 'string' || url.length > 2000) throw new HttpsError('invalid-argument', "That link doesn't look right.");
  const r = await readPage(url);
  if (r.error === 'bad-url') throw new HttpsError('invalid-argument', "That link doesn't look right.");
  // sent as a string: the callable protocol reads any object with an "@type" key as one of its own types, and JSON-LD is full of them
  const { ld, ...rest } = r;
  return ld ? { ...rest, ldJson: JSON.stringify(ld) } : rest;
});

export const readRecipe = onCall({ region: 'australia-southeast1', secrets: [KEY], timeoutSeconds: 180, memory: '512MiB', maxInstances: 3 }, async req => {
  const { email, fam } = await familyOnly(req);
  const ai = fam.ai || {};
  if (!ai.enabled) throw new HttpsError('failed-precondition', 'The family AI is switched off.');

  // check the input before spending anything
  const { task = 'read', images = [], text = '', url = '', title = '', steps = [], ingredients = [], avoid = [] } = req.data || {};
  const lines = l => Array.isArray(l) && l.length <= 150 && l.every(s => typeof s === 'string') && l.join('').length <= 30_000;
  if (task === 'simplify'){
    if (!lines(steps) || !steps.length || !lines(ingredients) || typeof title !== 'string' || title.length > 300)
      throw new HttpsError('invalid-argument', 'That method is empty or too long to simplify.');
  } else if (task === 'swaps'){
    if (!lines(ingredients) || !ingredients.length || !lines(avoid) || !avoid.length || avoid.length > 40 || typeof title !== 'string' || title.length > 300)
      throw new HttpsError('invalid-argument', 'Nothing to find swaps for.');
  } else if (task !== 'read') throw new HttpsError('invalid-argument', 'Unknown job.');
  else if (!Array.isArray(images) || images.length > 4 || images.some(i => typeof i !== 'string' || i.length > 3_000_000)) throw new HttpsError('invalid-argument', 'Up to 4 photos, each under about 2 MB.');
  if (task === 'read'){
    if (typeof text !== 'string' || text.length > 60_000) throw new HttpsError('invalid-argument', 'That text is too long.');
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw new HttpsError('invalid-argument', "That link doesn't look right.");
    if (!images.length && !text.trim() && !url) throw new HttpsError('invalid-argument', 'Nothing to read.');
  }

  // daily limit per person (NZ days)
  const limit = Math.max(1, +ai.dailyLimit || 20), day = NZ_DAY(), ref = db.doc(`rxUsage/${req.auth.uid}`);
  await db.runTransaction(async tx => {
    const u = (await tx.get(ref)).data() || {};
    const used = u.day === day ? u.count || 0 : 0;
    if (used >= limit) throw new HttpsError('resource-exhausted', `You've used today's ${limit} recipe reads. Try again tomorrow, or use Copy prompt.`);
    tx.set(ref, { day, count: used + 1, total: FieldValue.increment(1), email, last: FieldValue.serverTimestamp() }, { merge: true });
  });

  const client = new Anthropic({ apiKey: KEY.value() });
  try {
    const r = task === 'simplify' ? await simplifySteps(client, { title, ingredients, steps })
      : task === 'swaps' ? await swapIdeas(client, { title, ingredients, avoid }) : await read(client, { images, text, url });
    if (r.usage) await ref.set({ tokens: { input: FieldValue.increment(r.usage.input), output: FieldValue.increment(r.usage.output) } }, { merge: true });
    if (r.error === 'refused') throw new HttpsError('failed-precondition', 'The AI declined to read this one. Try Copy prompt instead.');
    if (r.error === 'too-long') throw new HttpsError('failed-precondition', 'The recipe was too long to read in one go.');
    if (r.error === 'fetch') throw new HttpsError('failed-precondition', `Couldn't open that page (${r.code}). Try pasting the recipe text instead.`);
    if (r.error) throw new HttpsError('deadline-exceeded', 'The AI took too long. Try again.');
    return task === 'simplify' ? r.simple : task === 'swaps' ? r.swaps : r.recipe;
  } catch (e){
    if (e instanceof HttpsError) throw e;
    console.error(e);
    // the family key or Claude failed, not the person: give the read back
    if (!(e instanceof Anthropic.BadRequestError)) await ref.set({ count: FieldValue.increment(-1), total: FieldValue.increment(-1) }, { merge: true }).catch(() => {});
    if (e instanceof Anthropic.AuthenticationError) throw new HttpsError('internal', 'The family Claude key was rejected. Ask whoever runs the app to check it.');
    if (e instanceof Anthropic.RateLimitError) throw new HttpsError('resource-exhausted', 'The family AI is busy or has reached its spend limit. Try later.');
    if (e instanceof Anthropic.BadRequestError) throw new HttpsError('invalid-argument', `Claude couldn't take that request: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new HttpsError('unavailable', `Claude error ${e.status ?? ''}. Try again.`);
    throw new HttpsError('internal', 'Something went wrong reading that recipe.');
  }
});
