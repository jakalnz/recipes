/* Family Recipes — app shell.
   Shares Firebase project shop-bf13d with Shop. Recipe data lives in rx* collections;
   who may use the app is in access/family (see firestore.rules). */
const firebaseConfig = {
  apiKey: "AIzaSyARWlYTJx1V1sdmVRMZ9I23B3pC9jXUryY",
  authDomain: "shop-bf13d.firebaseapp.com",
  projectId: "shop-bf13d",
  storageBucket: "shop-bf13d.firebasestorage.app",
  messagingSenderId: "339368462844",
  appId: "1:339368462844:web:75204fd7495a5982c10a79"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut, connectAuthEmulator }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, collection, doc, onSnapshot,
  getDoc, setDoc, updateDoc, deleteDoc, addDoc, deleteField, serverTimestamp, FieldPath, connectFirestoreEmulator, writeBatch,
  query, where, documentId, getDocs }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { PRESETS, LEVELS, presetById, checkRecipe, itemActive } from './diet.js';
import { readPaprika, parseIngredients, parseSteps, CATEGORIES } from './paprika.js';
import { metricRecipe } from './units.js';
import { findRecipe, fromJsonLd, fromAi, parseLooseJson } from './jsonld.js';
import { getAi, setAi, aiReady, canReadLinks, extractRecipe, copyPrompt, resizeImage, PROVIDERS, CLAUDE_MODELS, setFamilyAi, usingFamily } from './ai.js';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { makeIndex, computeRecipe, searchFoods, matchFood, parseLine } from './nutrition.js';
import { MEALS, MEAL_LABEL, iso, fromIso, addDays, weekStart, weekDays, dayShort, dayLong, shoppingList, matchShop, guessCategory, DEFAULT_PANTRY, isPantry } from './planner.js';

/* ---------- helpers (same as Shop) ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', 'en', { sensitivity: 'base' });
const LS = { get: k => { try { return localStorage.getItem('rx.' + k); } catch { return null; } },
             set: (k, v) => { try { localStorage.setItem('rx.' + k, v); } catch {} } };
let toastT;
function toast(m){ const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
function openSheet(html){
  const old = $('#sheet .panel'), top = old ? old.scrollTop : 0;
  $('#sheet').innerHTML = `<div class="scrim" data-a="closeSheet"></div><div class="panel" role="dialog">${html}</div>`; $('#sheet').classList.add('on');
  if (top) $('#sheet .panel').scrollTop = top;
}
function closeSheet(){ S.liveSheet = null; S.view = ''; $('#sheet').classList.remove('on'); $('#sheet').innerHTML = ''; }

const avgStars = r => { const v = Object.values(r.stars || {}).filter(n => n > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
const starText = n => n ? '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)) : '';

/* ---------- state ---------- */
const S = {
  user: null, access: null, hid: '', recipes: [], people: [], members: {}, photos: {}, importList: null,
  week: weekStart(new Date()), days: {}, familyMeals: [], household: {}, unsubWeek: null,
  tab: LS.get('tab') || 'recipes', liveSheet: null, editPerson: null,
};
const me = () => ({ uid: S.user.uid, name: (S.user.displayName || S.user.email || '?').split(/[ @]/)[0] });
const isAdmin = () => (S.access?.shop || []).includes(S.user?.email);
const households = () => S.access?.households || {};
const hhName = h => households()[h] || h;
const myPeople = () => S.people.filter(p => p.household === S.hid);
const accessRef = () => doc(db, 'access', 'family');
let app, auth, db, unsubs = [];

/* ---------- boot ---------- */
// Local testing only: http://localhost:<port>/?emu uses the Firebase emulators (npm run emu) instead of live data.
const EMU = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emu');
app = initializeApp(EMU ? { ...firebaseConfig, projectId: 'demo-recipes' } : firebaseConfig, EMU ? 'emu' : undefined);
auth = getAuth(app);
db = initializeFirestore(app, { localCache: EMU ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const fns = getFunctions(app, 'australia-southeast1');
// the family's shared AI key lives in this server function
const readRecipeFn = httpsCallable(fns, 'readRecipe', { timeout: 180000 });
async function familyRead(input){
  try { return (await readRecipeFn(input)).data; }
  catch (e){ console.error(e); throw new Error(e.code === 'functions/not-found' || e.code === 'functions/internal' && /not found|404/i.test(e.message) ? "The family AI isn't set up on the server yet." : e.message || 'The family AI had a problem.'); }
}
if (EMU){
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8181);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  document.title = 'Recipes (emulator)';
  // test sign-in without the popup: __emuSignIn('aunt.test@example.com')
  window.__emuSignIn = async email => {
    const { signInWithCredential } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    return signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email.replace(/\W/g, ''), email, email_verified: true })));
  };
}
onAuthStateChanged(auth, u => {
  S.user = u; unsubs.forEach(f => f()); unsubs = [];
  $('#signoutLogin').hidden = !u;
  if (u) start(); else { $('#login').hidden = false; $('#app').hidden = true; $('#loginMsg').textContent = 'Our family recipe book and meal planner.'; $('#signin').hidden = false; }
});
$('#signin').onclick = async () => {
  const p = new GoogleAuthProvider();
  try { await signInWithPopup(auth, p); }
  catch (e){ if (e.code !== 'auth/popup-closed-by-user') signInWithRedirect(auth, p); }
};
$('#signoutLogin').onclick = () => signOut(auth);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

/* ---------- install as an app ---------- */
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installEvt = null;
const showInstall = on => document.querySelectorAll('#installBtn, #installBtn2').forEach(b => b.hidden = !on);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; showInstall(true); });
addEventListener('appinstalled', () => { installEvt = null; showInstall(false); toast('Installed. Find “Recipes” with your other apps.'); });
if (isIOS && !standalone()) showInstall(true);
function installHelp(){
  const ios = isIOS;
  openSheet(`<h2>Install Recipes as an app</h2>
    ${ios ? `<ol><li>Open this page in <b>Safari</b> (not from inside Gmail, Messages or Facebook).</li>
      <li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
      <li>Make sure <b>Open as Web App</b> is switched on, then tap <b>Add</b>.</li></ol>`
    : `<ol><li>Open <b>jakalnz.github.io/recipes</b> in <b>Chrome</b> itself, not a link inside another app.</li>
      <li>Tap <b>⋮</b> (top right), then <b>Install app</b>. If you only see <b>Add to home screen</b>, tap it and choose <b>Install</b>, not <b>Create shortcut</b>.</li>
      <li>If you already have a shortcut that opens in the browser, remove it first.</li></ol>`}
    <p class="note">Installed, it opens full screen like Shop and shows up when you search your phone's apps.</p>
    <div class="btns"><button class="btn pri" data-a="closeSheet">OK</button></div>`);
}
async function install(){
  if (installEvt){ installEvt.prompt(); const { outcome } = await installEvt.userChoice; if (outcome === 'accepted') showInstall(false); installEvt = null; }
  else installHelp();
}

function notAllowed(){
  unsubs.forEach(f => f()); unsubs = [];
  $('#app').hidden = true; $('#login').hidden = false; $('#signin').hidden = true;
  $('#loginMsg').textContent = `${S.user?.email || 'This account'} isn't on the family list yet. Ask whoever runs the app to add this email address.`;
}
function denied(e){ console.error(e); if (e.code === 'permission-denied') notAllowed(); }

async function start(){
  try {
    const snap = await getDoc(accessRef());
    if (!snap.exists()) return notAllowed();
    S.access = snap.data();
  } catch (e){ return denied(e); }
  S.hid = S.access.members?.[S.user.email] || '';
  if (!S.hid) return notAllowed();
  $('#login').hidden = true; $('#app').hidden = false;
  unsubs.push(onSnapshot(accessRef(), s => { S.access = s.data() || {}; S.hid = S.access.members?.[S.user.email] || ''; if (!S.hid) return notAllowed();
    setFamilyAi(S.access.ai?.enabled ? familyRead : null); render(); if (S.view === 'settings') openSettings(); }, denied));
  unsubs.push(onSnapshot(collection(db, 'rxRecipes'), s => { S.recipes = s.docs.map(d => ({ id: d.id, ...d.data() })); convertOld(); render(); }, denied));
  unsubs.push(onSnapshot(collection(db, 'rxPeople'), s => { S.people = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)); render(); }, denied));
  unsubs.push(onSnapshot(collection(db, 'rxMembers'), s => { S.members = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); }, denied));
  unsubs.push(onSnapshot(collection(db, 'rxFamilyMeals'), s => { S.familyMeals = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.date.localeCompare(b.date)); render(); if (S.view === 'fm') viewFamilyMeal(S.fmId); }, denied));
  unsubs.push(onSnapshot(doc(db, 'rxHouseholds', S.hid), s => { S.household = s.data() || {}; }, () => {}));
  watchWeek();
  unsubs.push(() => S.unsubWeek?.());
  // keep my account record up to date
  setDoc(doc(db, 'rxMembers', S.user.uid), { name: me().name, email: S.user.email, household: S.hid, seen: serverTimestamp() }, { merge: true }).catch(denied);
  render();
  incomingImport();
}

// One-off: recipes saved before metric conversion existed get converted (originals kept). Safe to run twice.
const converting = new Set();
function convertOld(){
  for (const r of S.recipes){
    if (r.units || converting.has(r.id)) continue;
    converting.add(r.id);
    updateDoc(doc(db, 'rxRecipes', r.id), metricRecipe(r)).catch(e => { console.error(e); converting.delete(r.id); });
  }
}

/* ---------- render ---------- */
function render(){
  if (!S.user || !S.access) return;
  $('#hhName').textContent = hhName(S.hid);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#vRecipes').hidden = S.tab !== 'recipes'; $('#vPlan').hidden = S.tab !== 'plan'; $('#vFamily').hidden = S.tab !== 'family';
  if (S.tab === 'recipes') renderRecipes();
  if (S.tab === 'family') renderFamily();
  if (S.tab === 'plan') renderPlan();
  if (S.liveSheet) S.liveSheet();
}

function renderRecipes(){
  const sel = $('#rcat'), cur = sel.value || LS.get('cat') || '';
  sel.innerHTML = `<option value="">All categories</option>` + CATEGORIES.map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const q = $('#rq').value.trim().toLowerCase(), sort = $('#rsort').value;
  let list = S.recipes.filter(r => (!cur || (r.cats || []).includes(cur)) &&
    (!q || [r.title, ...(r.cats || []), ...(r.tags || []), ...(r.ingredients || []).map(i => i.original)].join(' ').toLowerCase().includes(q)));
  list.sort(sort === 'az' ? byTitle : sort === 'rated' ? (a, b) => avgStars(b) - avgStars(a) || byTitle(a, b)
    : (a, b) => (b.created?.seconds || 0) - (a.created?.seconds || 0));
  $('#rcount').textContent = S.recipes.length ? `${list.length} of ${S.recipes.length} recipes` : '';
  const mine = myPeople();
  $('#recipesBody').innerHTML = !S.recipes.length
    ? `<p class="empty">No recipes yet.<br>Tap “+ Add recipe” to start the family book.</p>`
    : !list.length ? `<p class="empty">Nothing matches.</p>`
    : `<ul class="rows">${list.map(r => {
        const flags = checkRecipe(r.ingredients, mine);
        const worst = flags[0];
        return `<li class="row" data-a="viewRecipe" data-id="${r.id}"><div class="grow">
          <div class="nm">${esc(r.title)}</div>
          <div class="sub">${avgStars(r) ? `<span class="stars" aria-label="${avgStars(r).toFixed(1)} stars">${starText(avgStars(r))}</span>` : ''}
            ${(r.cats || []).map(c => `<span class="pill plain">${esc(c)}</span>`).join('')}
            ${(r.tags || []).map(c => `<span class="pill plain">#${esc(c)}</span>`).join('')}
            ${worst ? `<span class="pill ${worst.level === 'allergy' ? 'bad' : 'warn'}">${flags.length} flag${flags.length === 1 ? '' : 's'} for your household</span>` : ''}
            ${r.createdBy ? `<span>by ${esc(r.createdBy.name)}</span>` : ''}</div></div></li>`; }).join('')}</ul>`;
}

/* ---------- people & dietary needs ---------- */
function needsSummary(p, showConditions){
  const out = [];
  for (const pid of p.presets || []){
    const pr = presetById(pid); if (!pr) continue;
    if (showConditions) out.push(pr.label);
    else out.push(...pr.items.filter(it => itemActive(p, pid, it)).map(it => `${it.label.toLowerCase()} (${LEVELS[it.level].short})`));
  }
  for (const c of p.custom || []) out.push(`${c.item} (${LEVELS[c.level]?.short || c.level})`);
  return [...new Set(out)];
}
function renderFamily(){
  const hs = Object.keys(households()).sort((a, b) => (a === S.hid ? -1 : b === S.hid ? 1 : hhName(a).localeCompare(hhName(b))));
  $('#familyBody').innerHTML = hs.map(h => {
    const ps = S.people.filter(p => p.household === h), mine = h === S.hid;
    return `<h3 class="sec">${esc(hhName(h))}${mine ? ' · your household' : ''}</h3>
      <ul class="rows">${ps.map(p => {
        const n = needsSummary(p, p.showConditions !== false);
        return `<li class="row" ${mine || isAdmin() ? `data-a="editPerson" data-id="${p.id}"` : ''}><div class="grow"><div class="nm">${esc(p.name)}</div>
          <div class="sub">${n.length ? n.map(x => `<span class="pill plain">${esc(x)}</span>`).join('') : '<span>No dietary needs added</span>'}</div></div></li>`; }).join('')
        || `<li class="row" style="cursor:default"><div class="grow note">No one added yet.</div></li>`}</ul>
      ${mine || isAdmin() ? `<div class="toolrow"><button class="btn sm" data-a="newPerson" data-h="${h}">+ Add a person</button></div>` : ''}`;
  }).join('') + `<p class="note" style="padding:14px">Add everyone who eats with you, including people without a Google account. Their dietary needs are used to flag recipes and plan family meals.</p>`;
}

function openPerson(id, h){
  const p = id ? S.people.find(x => x.id === id) : { name: '', household: h || S.hid, presets: [], presetOff: [], presetOn: [], custom: [], showConditions: true };
  if (!p) return closeSheet();
  S.liveSheet = null; S.view = '';
  S.editPerson = structuredClone(p);
  drawPerson();
}
function drawPerson(){
  const p = S.editPerson, on = new Set(p.presets);
  const group = (kind, title) => `<h3>${title}</h3>` + PRESETS.filter(x => x.kind === kind).map(pr => `
    <label class="cb"><input type="checkbox" data-a="pPreset" data-p="${pr.id}" ${on.has(pr.id) ? 'checked' : ''}> <span>${esc(pr.label)}</span></label>
    ${on.has(pr.id) && (pr.items.length > 1 || pr.items.some(it => it.optional)) ? `<div class="card"><p class="note">${esc(pr.note || '')}</p>${pr.items.map(it => `
      <label class="cb"><input type="checkbox" data-a="pItem" data-k="${pr.id}:${it.id}" data-opt="${it.optional ? 1 : ''}" ${itemActive(p, pr.id, it) ? 'checked' : ''}>
        <span>${esc(it.label)}<small>${esc(LEVELS[it.level].label)} · e.g. ${esc(it.words.slice(0, 5).join(', '))}</small></span></label>`).join('')}</div>`
      : on.has(pr.id) && pr.note ? `<p class="note">${esc(pr.note)}</p>` : ''}`).join('');
  openSheet(`<h2>${p.id ? esc(p.name) : 'Add a person'}</h2>
    <label>Name<input id="p_name" value="${esc(p.name)}" placeholder="e.g. Dad"></label>
    ${isAdmin() ? `<label>Household<select id="p_hh">${Object.keys(households()).map(h => `<option value="${h}" ${h === p.household ? 'selected' : ''}>${esc(hhName(h))}</option>`).join('')}</select></label>` : ''}
    <h3>Their own foods to avoid</h3>
    <p class="note">Anything that disagrees with them, for example cabbage.</p>
    ${(p.custom || []).map((c, n) => `<div class="mini"><span class="grow">${esc(c.item)}</span>
      <select data-a-change="pLevel" data-n="${n}" aria-label="How serious">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${k === c.level ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
      <button class="btn sm danger" data-a="pDelCustom" data-n="${n}" aria-label="Remove ${esc(c.item)}">✕</button></div>`).join('')}
    <div class="mini"><input id="p_custom" placeholder="Add a food, e.g. cabbage"><select id="p_level" aria-label="How serious">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}" ${k === 'upset' ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
      <button class="btn sm pri" data-a="pAddCustom">Add</button></div>
    ${group('condition', 'Health')}
    ${group('diet', 'Diet')}
    ${group('allergen', 'Allergies')}
    <h3>Sharing</h3>
    <label class="cb"><input type="checkbox" id="p_show" ${p.showConditions !== false ? 'checked' : ''}> <span>Show health conditions by name to the family<small>If off, the family only sees the foods to avoid, not why.</small></span></label>
    <p class="note">This is a keyword check to help spot things in recipes. It isn't medical advice.</p>
    <div class="btns"><button class="btn pri" data-a="pSave">Save</button>
      ${p.id ? `<button class="btn danger" data-a="pDelete">Delete</button>` : ''}
      <button class="btn" data-a="closeSheet">Cancel</button></div>`);
}
function readPersonForm(){
  const p = S.editPerson;
  p.name = $('#p_name')?.value.trim() ?? p.name;
  if ($('#p_hh')) p.household = $('#p_hh').value;
  if ($('#p_show')) p.showConditions = $('#p_show').checked;
}
async function savePerson(){
  readPersonForm();
  const p = S.editPerson;
  if (!p.name){ toast('Add a name first'); return; }
  const data = { name: p.name, household: p.household, presets: p.presets, presetOff: p.presetOff || [], presetOn: p.presetOn || [], custom: p.custom || [], showConditions: p.showConditions !== false, updatedBy: me() };
  try {
    if (p.id) await setDoc(doc(db, 'rxPeople', p.id), data);
    else await addDoc(collection(db, 'rxPeople'), data);
    closeSheet(); toast(`Saved ${p.name}`);
  } catch (e){ console.error(e); toast("Couldn't save. Only people in their household can change this."); }
}

/* ---------- recipes (basic add / view / edit) ---------- */
// draft: an imported recipe to check before saving (from a web page, photo, pasted text or chatbot reply)
function openRecipeForm(id, draft){
  const r = id ? S.recipes.find(x => x.id === id) : draft || { title: '', cats: [], servings: 4, ingredients: [], steps: [], notes: '', source: {} };
  if (!r) return closeSheet();
  S.liveSheet = null; S.view = ''; S.draft = id ? null : draft || null;
  const pic = draft?.photo || draft?.photoUrl;
  openSheet(`<h2>${id ? 'Edit recipe' : draft ? 'Check the recipe' : 'Add a recipe'}</h2>
    ${draft ? `<p class="note">Read from ${esc(draft.from || 'the import')}. Check it over, fix anything, then Save. Ounces, pounds and °F are converted to metric when you save.</p>` : ''}
    ${draft?.unclear?.length ? `<p class="warnline">The AI wasn't sure about: ${draft.unclear.map(esc).join('; ')}</p>` : ''}
    ${pic ? `<img class="formpic" src="${esc(pic)}" alt="">${draft.photoUrl && !draft.photo ? '<p class="note">Photo shown from the website.</p>' : ''}` : ''}
    <label>Title<input id="r_title" value="${esc(r.title)}"></label>
    <div class="grid2" style="margin-top:6px">${CATEGORIES.map(c => `<label class="cb"><input type="checkbox" data-cat="${esc(c)}" ${(r.cats || []).includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div>
    <label>Serves<input id="r_serves" type="number" min="1" inputmode="numeric" value="${esc(r.servings || '')}"></label>
    <label>Ingredients, one per line<textarea id="r_ings" rows="8">${esc((r.ingredients || []).map(i => i.heading ? i.original + ':' : i.original).join('\n'))}</textarea></label>
    <p class="note">A line ending in a colon, like “For the sauce:”, becomes a heading.</p>
    <label>Method, one step per line<textarea id="r_steps" rows="8">${esc((r.steps || []).join('\n'))}</textarea></label>
    <label>Notes and family tips<textarea id="r_notes" rows="3">${esc(r.notes || '')}</textarea></label>
    <label>Source link<input id="r_url" type="url" value="${esc(r.source?.url || '')}" placeholder="https://"></label>
    <div class="btns"><button class="btn pri" data-a="saveRecipe" data-id="${id || ''}">Save</button><button class="btn" data-a="closeSheet">Cancel</button></div>`);
}
async function saveRecipe(t){
  const id = t.dataset.id, title = $('#r_title').value.trim();
  if (!title){ toast('Add a title first'); return; }
  const lines = s => s.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const data = {
    title, cats: [...document.querySelectorAll('[data-cat]:checked')].map(x => x.dataset.cat),
    servings: +$('#r_serves').value || null,
    ingredients: parseIngredients($('#r_ings').value),
    steps: lines($('#r_steps').value), notes: $('#r_notes').value.trim(),
    source: { ...(S.recipes.find(x => x.id === id)?.source || S.draft?.source || {}), url: $('#r_url').value.trim() }, updated: serverTimestamp(),
  };
  const d = !id && S.draft;
  if (d){   // details the form doesn't show
    Object.assign(data, { tags: d.tags || [], servingsText: d.servingsText || '', prepTime: d.prepTime || '', cookTime: d.cookTime || '', totalTime: d.totalTime || '',
      imported: { from: d.from || 'import', at: new Date().toISOString().slice(0, 10) } });
    if (d.photoUrl && !d.photo) data.photoUrl = d.photoUrl;
    if (d.photo) data.hasPhoto = true;
  }
  // what's typed is the new original; convert anything imperial to metric
  const m = metricRecipe({ ingredients: data.ingredients, steps: data.steps });
  if (m.ingredients) data.ingredients = m.ingredients;
  if (m.steps) data.steps = m.steps;
  data.units = 1;
  if (m.stepsWas) data.stepsWas = m.stepsWas; else if (id) data.stepsWas = deleteField();
  try {
    if (id) await updateDoc(doc(db, 'rxRecipes', id), data);
    else {
      const ref = await addDoc(collection(db, 'rxRecipes'), { ...data, createdBy: me(), created: serverTimestamp() }); t.dataset.id = ref.id;
      if (d?.photo) await setDoc(doc(db, 'rxPhotos', ref.id), { data: d.photo }).catch(e => { console.error(e); toast('Saved, but the photo was too big to keep'); });
      S.draft = null;
    }
    toast(`Saved ${title}`); viewRecipe(t.dataset.id);
  } catch (e){ console.error(e); toast("Couldn't save the recipe"); }
}
function viewRecipe(id){
  S.liveSheet = () => viewRecipe(id); S.view = '';
  const r = S.recipes.find(x => x.id === id); if (!r){ closeSheet(); return; }
  const scope = LS.get('flagScope') || 'mine';
  const people = scope === 'all' ? S.people : myPeople();
  const flags = checkRecipe(r.ingredients, people);
  const canDelete = r.createdBy?.uid === S.user.uid || isAdmin();
  let host = ''; try { host = r.source?.url ? new URL(r.source.url).hostname.replace(/^www\./, '') : ''; } catch {}
  if (r.hasPhoto && !(id in S.photos)){
    S.photos[id] = null;
    getDoc(doc(db, 'rxPhotos', id)).then(s => { S.photos[id] = s.data()?.data || ''; if (S.liveSheet) S.liveSheet(); }).catch(() => {});
  }
  const mine = r.stars?.[S.user.uid] || 0, avg = avgStars(r), raters = Object.values(r.stars || {}).filter(n => n > 0).length;
  const times = [r.prepTime && `Prep ${r.prepTime}`, r.cookTime && `Cook ${r.cookTime}`, r.totalTime && `Total ${r.totalTime}`].filter(Boolean);
  const nut = r.nutrition?.website;
  const conv = (r.ingredients || []).some(i => i.was) || !!r.stepsWas, orig = conv && S.showOrig === id;
  const NUT = [['carbs', 'Carbs', 'g'], ['sugar', 'Sugar', 'g'], ['fat', 'Fat', 'g'], ['satFat', 'Sat. fat', 'g'], ['protein', 'Protein', 'g'], ['fibre', 'Fibre', 'g'], ['kcal', 'Energy', ' kcal']];
  const hero = S.photos[id] || (!r.hasPhoto && r.photoUrl) || '';
  openSheet(`${hero ? `<img class="hero" src="${esc(hero)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<h2>${esc(r.title)}</h2>
    <div class="sub">${(r.cats || []).map(c => `<span class="pill plain">${esc(c)}</span>`).join('')}
      ${(r.tags || []).map(c => `<span class="pill plain">#${esc(c)}</span>`).join('')}
      ${r.servings ? `<span>Serves ${esc(r.servingsText && /\d\s*[-–]\s*\d/.test(r.servingsText) ? r.servingsText.replace(/^\D+/, '') : r.servings)}</span>` : ''}
      ${times.map(t => `<span>${esc(t)}</span>`).join('')}
      ${r.createdBy ? `<span>Added by ${esc(r.createdBy.name)}${r.imported?.from ? ` from ${esc(r.imported.from)}` : ''}</span>` : ''}
      ${host ? `<a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(host)}</a>` : ''}</div>
    <div class="rate" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `<button data-a="rate" data-id="${r.id}" data-n="${n === mine ? 0 : n}" aria-label="${n} star${n > 1 ? 's' : ''}" class="${n <= mine ? 'on' : ''}">★</button>`).join('')}
      <span class="note">${mine ? 'Your rating' : 'Tap to rate'}${raters ? ` · family average ${avg.toFixed(1)} from ${raters}` : ''}</span></div>
    <h3>Dietary check</h3>
    <div class="btns" style="margin-top:0"><button class="btn sm ${scope === 'mine' ? 'pri' : ''}" data-a="flagScope" data-s="mine">My household</button>
      <button class="btn sm ${scope === 'all' ? 'pri' : ''}" data-a="flagScope" data-s="all">Whole family</button></div>
    ${!people.length ? `<p class="note">Add people and their needs on the Family tab to check recipes.</p>`
      : flags.length ? flags.map(f => `<div class="mini"><span class="pill ${f.level === 'allergy' ? 'bad' : 'warn'}">${esc(LEVELS[f.level].short)}</span>
          <span class="grow"><strong>${esc(f.person)}</strong>: ${esc(f.label)} · <span class="note">${esc(f.ingredient)}</span>${f.hint ? `<br><span class="note">${esc(f.hint)}</span>` : ''}</span></div>`).join('')
      : `<p class="note">Nothing flagged for ${scope === 'all' ? 'the family' : 'your household'}.</p>`}
    <h3>Ingredients</h3>
    ${conv ? `<p class="note">${orig ? 'Showing the original wording.' : 'Converted to metric.'} <button class="link" data-a="toggleOrig" data-id="${r.id}">${orig ? 'Show metric' : 'Show original'}</button></p>` : ''}
    ${(r.ingredients || []).length ? `<ul class="ings">${r.ingredients.map(i => i.heading ? `<li class="ih">${esc(i.original)}</li>` : `<li>${esc(orig && i.was ? i.was : i.original)}</li>`).join('')}</ul>` : '<p class="note">None yet.</p>'}
    <h3>Method</h3>
    ${(r.steps || []).length ? `<ol>${(orig && r.stepsWas ? r.stepsWas : r.steps).map(s =>`<li style="margin-bottom:8px">${esc(s)}</li>`).join('')}</ol>` : '<p class="note">None yet.</p>'}
    ${r.notes ? `<h3>Notes</h3><p style="white-space:pre-line">${esc(r.notes)}</p>` : ''}
    ${nutritionSection(r)}
    ${nut ? `<details class="sub-d"><summary>What the website said</summary><p class="note">Copied from the website by Paprika. Not checked and sometimes wrong.</p>
      <div class="nut">${NUT.filter(([k]) => nut[k] != null).map(([k, l, u]) => `<div><b>${esc(nut[k])}${u}</b><span>${l}</span></div>`).join('')}</div></details>` : ''}
    <div class="btns"><button class="btn tag" data-a="planRecipe" data-id="${r.id}">Add to plan</button><button class="btn" data-a="editRecipe" data-id="${r.id}">Edit</button>
      ${canDelete ? `<button class="btn danger" data-a="delRecipe" data-id="${r.id}">Delete</button>` : ''}
      <button class="btn pri" data-a="closeSheet">Done</button></div>`);
}

/* ---------- nutrition (NZ FOODfiles → AFCD → USDA) ---------- */
const SRC = { nz: 'NZ', au: 'AU', us: 'US' };
const SRC_LONG = { nz: 'NZ FOODfiles 2024', au: 'Australian Food Composition Database', us: 'USDA FoodData Central' };
const HIGH_FAT = 20;   // g fat per serving shown as "higher fat"
function loadFoods(){
  if (S.foods || S.foodsLoading) return S.foodsLoading;
  S.foodsLoading = (async () => {
    try {
      const meta = (await getDoc(doc(db, 'rxFoods', 'meta'))).data();
      if (!meta) throw new Error('The food table has not been loaded yet.');
      const parts = await Promise.all(Array.from({ length: meta.parts }, (_, i) => getDoc(doc(db, 'rxFoods', 'p' + i))));
      S.foods = makeIndex({ foods: parts.flatMap(p => JSON.parse(p.data().foods)), sources: meta.sources, fields: meta.fields });
      S.foodsMeta = meta;
    } catch (e){ console.error(e); S.foodsError = e.message; S.foodsLoading = null; }
    S.liveSheet?.();
  })();
  return S.foodsLoading;
}
const fixesFor = r => {
  const map = r.nutritionFix || {}, out = {};
  (r.ingredients || []).forEach((ing, i) => { if (map[ing.original]) out[i] = map[ing.original]; });
  return out;
};
const g1 = v => v == null ? '–' : v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1);
function nutritionSection(r){
  if (!(r.ingredients || []).some(i => !i.heading)) return '';
  if (!S.foods){
    if (S.foodsError) return `<h3>Nutrition</h3><p class="note">Couldn't load the food table: ${esc(S.foodsError)}</p>`;
    loadFoods();
    return `<h3>Nutrition</h3><p class="note">Working out nutrition…</p>`;
  }
  const N = computeRecipe(r, S.foods, fixesFor(r));
  S.nutCache = { id: r.id, N };
  const view = S.nutView || 'serving';
  const base = view === 'serving' && N.perServing ? N.perServing : view === '100' && N.per100 ? N.per100 : N.total;
  const label = base === N.perServing ? `per serving (about ${Math.round(N.servingGrams)} g)` : base === N.per100 ? 'per 100 g' : `whole recipe (${Math.round(N.weight)} g)`;
  const kcal = base.kJ / 4.184, portions = base.carbs / 15;
  const checked = r.nutritionChecked;
  const bad = N.lines.filter(l => l.status === 'unmatched' || l.status === 'no grams'), unsure = N.lines.filter(l => l.status === 'check');
  const icon = { ok: '✓', check: '?', unmatched: '!', 'no grams': '!', skipped: '–', 'no amount': '–' };
  return `<h3>Nutrition ${checked ? `<span class="pill plain">checked by ${esc(checked.by)}</span>` : '<span class="pill plain">estimate</span>'}</h3>
    ${!N.servings ? `<div class="mini"><span class="grow">How many servings does this make?</span><input id="nutServes" type="number" min="1" inputmode="numeric" style="max-width:80px"><button class="btn sm pri" data-a="nutServes" data-id="${r.id}">Set</button></div>` : ''}
    <div class="btns" style="margin-top:4px">${[['serving', 'Per serving'], ['100', 'Per 100 g'], ['total', 'Whole recipe']].filter(([v]) => v !== 'serving' || N.perServing)
      .map(([v, l]) => `<button class="btn sm ${view === v || (v === 'total' && base === N.total && view !== '100') ? 'pri' : ''}" data-a="nutView" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="note">${esc(label)}</p>
    <div class="nut">
      <div class="key"><b>${g1(base.carbs)} g</b><span>Carbohydrate${portions >= 0.1 ? ` · ${portions.toFixed(1)} × 15 g` : ''}</span></div>
      <div><b>${g1(base.sugars)} g</b><span>of which sugars</span></div>
      <div><b>${g1(base.fibre)} g</b><span>Fibre</span></div>
      <div class="key"><b>${g1(base.fat)} g</b><span>Fat${base === N.perServing && base.fat >= HIGH_FAT ? ' · <em>higher fat</em>' : ''}</span></div>
      <div><b>${g1(base.satFat)} g</b><span>Saturated fat</span></div>
      <div><b>${g1(base.protein)} g</b><span>Protein</span></div>
      <div><b>${Math.round(base.kJ)} kJ</b><span>${Math.round(kcal)} kcal</span></div>
      <div><b>${Math.round(base.sodium)} mg</b><span>Sodium (excl. added salt)</span></div>
    </div>
    ${bad.length ? `<p class="warnline">${bad.length} ingredient${bad.length > 1 ? 's' : ''} couldn't be worked out and ${bad.length > 1 ? 'are' : 'is'} not included. Open the breakdown and tap Fix.</p>` : ''}
    ${unsure.length ? `<p class="note">${unsure.length} match${unsure.length > 1 ? 'es' : ''} marked ? may be the wrong food. Worth a look.</p>` : ''}
    <details class="sub-d" ${S.nutOpen === r.id ? 'open' : ''} data-nut="${r.id}"><summary>How this was worked out</summary>
      <ul class="nutlines">${N.lines.map(l => `<li class="s-${l.status.replace(' ', '-')}"><span class="st" aria-label="${esc(l.status)}">${icon[l.status] || ''}</span>
        <span class="grow">${esc(l.text)}<br><small>${l.food ? `${esc(l.food.name.slice(0, 70))} <span class="pill plain">${SRC[l.food.src]}</span> · ${l.grams != null ? `${l.approx ? '≈' : ''}${Math.round(l.grams)} g` : esc(l.how || '')}${l.values ? ` · ${g1(l.values.carbs)} g carbs · ${g1(l.values.fat)} g fat` : ''}`
          : esc(l.status === 'unmatched' ? 'No matching food found' : l.how || '')}</small></span>
        <button class="btn sm" data-a="nutFix" data-id="${r.id}" data-i="${l.i}">${l.status === 'ok' || l.status === 'skipped' || l.status === 'no amount' ? 'Change' : 'Fix'}</button></li>`).join('')}</ul>
      <p class="note">Worked out from raw ingredient weights, so water lost in cooking isn't counted. Sources: ${N.sources.map(s => SRC_LONG[s]).join(', ') || 'none'}.
        NZ data: New Zealand FOODfiles 2024, © Plant & Food Research and Ministry of Health. AU data © Food Standards Australia New Zealand (CC BY 4.0). US data: USDA FoodData Central (public domain).</p>
      ${!bad.length ? `<div class="btns" style="margin-top:6px"><button class="btn sm" data-a="nutChecked" data-id="${r.id}">${checked ? 'Remove checked mark' : 'Mark as checked'}</button></div>` : ''}
    </details>
    <p class="note">An estimate to help with your own diabetes or Creon plan, not medical advice.</p>`;
}
function openNutFix(rid, i){
  const r = S.recipes.find(x => x.id === rid); if (!r || !S.foods) return;
  const ing = r.ingredients[i], cur = (r.nutritionFix || {})[ing.original] || {};
  const line = S.nutCache?.id === rid ? S.nutCache.N.lines.find(l => l.i === i) : null;
  S.fix = { rid, i, text: ing.original, foodId: cur.foodId || line?.food?.id || '', grams: cur.grams ?? (line?.grams != null ? Math.round(line.grams) : '') };
  S.liveSheet = null; S.view = '';
  openSheet(`<h2>Nutrition for one ingredient</h2>
    <p><b>${esc(ing.original)}</b></p>
    <label>Search foods<input id="nfQ" value="${esc(parseLine(ing.original).item)}" autocomplete="off"></label>
    <div id="nfResults"></div>
    <label>Grams in the whole recipe<input id="nfG" type="number" min="0" step="any" inputmode="decimal" value="${esc(S.fix.grams)}"></label>
    <p class="note">Weigh it, or use the packet. For example, 1 can of chickpeas drained ≈ 240 g.</p>
    <div class="btns"><button class="btn pri" data-a="nfSave">Save</button><button class="btn" data-a="nfSkip">Leave it out</button>
      ${cur.foodId || cur.grams != null || cur.skip ? '<button class="btn" data-a="nfReset">Back to automatic</button>' : ''}<button class="btn" data-a="closeSheet">Cancel</button></div>`);
  drawFixResults();
}
function drawFixResults(){
  const q = $('#nfQ')?.value.trim(); if (!q) { $('#nfResults').innerHTML = ''; return; }
  const seen = new Set(), list = [];
  const cur = S.fix.foodId && S.foods.byId.get(S.fix.foodId);
  for (const c of [...(cur ? [{ food: cur }] : []), ...matchFood(q, S.foods, 6), ...searchFoods(q, S.foods, 25)]) if (c.food && !seen.has(c.food.id)){ seen.add(c.food.id); list.push(c.food); }
  $('#nfResults').innerHTML = list.length ? `<div class="nfr">${list.slice(0, 20).map(f => `<label class="cb"><input type="radio" name="nfFood" value="${esc(f.id)}" ${f.id === S.fix.foodId ? 'checked' : ''}>
    <span>${esc(f.name)} <span class="pill plain">${SRC[f.src]}</span><small>per 100 g: ${g1(f.n[0])} g carbs · ${g1(f.n[3])} g fat${f.m?.cup ? ` · 1 cup ≈ ${Math.round(f.m.cup)} g` : ''}</small></span></label>`).join('')}</div>`
    : '<p class="note">Nothing found. Try a simpler word, e.g. "beans" or "cheese".</p>';
}
async function saveFix(val){
  const r = S.recipes.find(x => x.id === S.fix.rid); if (!r) return;
  const map = { ...(r.nutritionFix || {}) };
  if (val === null) delete map[S.fix.text]; else map[S.fix.text] = val;
  try { await updateDoc(doc(db, 'rxRecipes', r.id), { nutritionFix: map, nutritionChecked: deleteField() }); S.nutOpen = r.id; viewRecipe(r.id); }
  catch (e){ console.error(e); toast("Couldn't save that"); }
}

/* ---------- meal planner ---------- */
const daysRef = () => collection(db, 'rxPlans', S.hid, 'days');
const uid8 = () => Math.random().toString(36).slice(2, 10);
const recipeById = id => S.recipes.find(r => r.id === id);
function watchWeek(){
  S.unsubWeek?.();
  const from = iso(S.week), to = iso(addDays(S.week, 6));
  S.unsubWeek = onSnapshot(query(daysRef(), where(documentId(), '>=', from), where(documentId(), '<=', to)), s => {
    S.days = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); render();
  }, denied);
}
const myFamilyMeals = () => S.familyMeals.filter(m => m.host === S.hid || (m.invited || []).includes(S.hid));
function renderPlan(){
  const days = weekDays(S.week), today = iso(new Date());
  const range = `${days[0].toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}`;
  const fms = myFamilyMeals();
  const upcoming = fms.filter(m => m.date >= today && (m.date < iso(S.week) || m.date > iso(days[6]))).slice(0, 3);
  $('#planBody').innerHTML = `
    <div class="weeknav"><button class="btn sm" data-a="weekPrev" aria-label="Previous week">‹</button>
      <b>${esc(range)}</b><button class="btn sm" data-a="weekNext" aria-label="Next week">›</button>
      ${iso(S.week) !== iso(weekStart(new Date())) ? '<button class="btn sm" data-a="weekNow">This week</button>' : ''}</div>
    <div class="toolrow"><button class="btn sm tag" data-a="shopList">Shopping list</button><button class="btn sm" data-a="newFamilyMeal">+ Family meal</button></div>
    ${upcoming.length ? `<p class="sec" style="padding-top:12px">Coming up</p>${upcoming.map(fmCard).join('')}` : ''}
    ${days.map(d => {
      const k = iso(d), day = S.days[k]?.meals || {}, fm = fms.filter(m => m.date === k);
      const items = MEALS.flatMap(meal => (day[meal] || []).map(e => ({ ...e, meal })));
      return `<div class="day ${k === today ? 'today' : ''} ${k < today ? 'past' : ''}"><div class="dayhead"><b>${esc(dayShort(d))}</b> <span>${d.getDate()}</span>
          <button class="btn sm" data-a="planAdd" data-d="${k}">+ Add</button></div>
        ${fm.map(fmCard).join('')}
        ${items.length ? `<ul class="plan">${items.map(e => {
          const r = e.recipeId && recipeById(e.recipeId);
          return `<li><span class="meal">${esc(MEAL_LABEL[e.meal])}</span><span class="grow" ${r ? `data-a="viewRecipe" data-id="${r.id}"` : ''}>${esc(r?.title || e.title || e.text || '?')}
            <small>${e.servings ? `${e.servings} serves` : ''}${e.leftover ? ' · leftovers' : ''}${e.note ? ' · ' + esc(e.note) : ''}</small></span>
            <button class="x" data-a="planDel" data-d="${k}" data-meal="${e.meal}" data-e="${e.id}" aria-label="Remove">✕</button></li>`; }).join('')}</ul>`
          : fm.length ? '' : '<p class="note">Nothing planned.</p>'}</div>`;
    }).join('')}`;
}
function fmCard(m){
  const coming = Object.values(m.rsvp || {}).reduce((a, b) => a + (+b || 0), 0), mine = (m.dishes || []).filter(x => x.hid === S.hid);
  return `<div class="fm" data-a="viewFm" data-id="${m.id}"><b>${esc(m.title || 'Family ' + (m.meal || 'dinner'))}</b>
    <small>${esc(dayLong(fromIso(m.date)))} · ${esc(MEAL_LABEL[m.meal] || '')} · hosted by ${esc(hhName(m.host))}${coming ? ` · ${coming} coming` : ''}</small>
    <small>${(m.dishes || []).length ? `${m.dishes.length} dish${m.dishes.length > 1 ? 'es' : ''}${mine.length ? `, you're bringing ${mine.map(d => esc(d.title)).join(', ')}` : ''}` : 'No dishes yet. Plan ahead!'}</small></div>`;
}

// add a recipe to the plan (from a day, or from a recipe)
function openPlanAdd({ date, recipeId } = {}){
  S.liveSheet = null; S.view = '';
  S.pa = { date: date || iso(new Date()), recipeId: recipeId || '', meal: 'dinner' };
  const r = recipeId && recipeById(recipeId);
  openSheet(`<h2>Add to the plan</h2>
    <div class="grid2"><label>Day<input id="pa_date" type="date" value="${S.pa.date}"></label>
      <label>Meal<select id="pa_meal">${MEALS.map(m => `<option value="${m}" ${m === 'dinner' ? 'selected' : ''}>${MEAL_LABEL[m]}</option>`).join('')}</select></label></div>
    ${r ? `<p><b>${esc(r.title)}</b></p>` : `<label>Recipe<input id="pa_q" placeholder="Search family recipes" autocomplete="off"></label><div id="pa_list" class="pick"></div>
      <label>…or just write something<input id="pa_text" placeholder="e.g. Fish and chips, Out for dinner"></label>`}
    <div class="grid2"><label>Serves<input id="pa_serves" type="number" min="1" inputmode="numeric" value="${esc(r?.servings || S.household.serves || 4)}"></label>
      <label class="cb" style="margin-top:34px"><input type="checkbox" id="pa_left"> Leftovers (nothing to buy)</label></div>
    <label>Note<input id="pa_note" placeholder="optional"></label>
    <div class="btns"><button class="btn pri" data-a="paSave">Add</button><button class="btn" data-a="closeSheet">Cancel</button></div>`);
  if (!r) drawPaList();
}
function drawPaList(){
  const q = ($('#pa_q')?.value || '').trim().toLowerCase();
  const list = S.recipes.filter(r => !q || r.title.toLowerCase().includes(q) || (r.cats || []).some(c => c.toLowerCase().includes(q))).sort(byTitle).slice(0, 30);
  $('#pa_list').innerHTML = list.map(r => `<label class="cb"><input type="radio" name="pa_r" value="${r.id}" ${r.id === S.pa.recipeId ? 'checked' : ''}> <span>${esc(r.title)}<small>${(r.cats || []).join(' · ')}</small></span></label>`).join('') || '<p class="note">No recipes match.</p>';
}
async function savePlanAdd(){
  const date = $('#pa_date').value, meal = $('#pa_meal').value;
  const recipeId = S.pa.recipeId || document.querySelector('input[name=pa_r]:checked')?.value || '';
  const text = $('#pa_text')?.value.trim() || '';
  if (!date){ toast('Pick a day'); return; }
  if (!recipeId && !text){ toast('Pick a recipe or write something'); return; }
  const entry = { id: uid8(), servings: +$('#pa_serves').value || null, leftover: $('#pa_left').checked, note: $('#pa_note').value.trim(), by: me().name };
  if (recipeId){ entry.recipeId = recipeId; entry.title = recipeById(recipeId)?.title || ''; } else entry.text = text;
  try {
    const ref = doc(daysRef(), date), cur = (await getDoc(ref)).data()?.meals || {};
    await setDoc(ref, { meals: { ...cur, [meal]: [...(cur[meal] || []), entry] } }, { merge: true });
    closeSheet(); toast(`Added to ${dayLong(fromIso(date))}`);
    const w = weekStart(fromIso(date)); if (iso(w) !== iso(S.week)){ S.week = w; watchWeek(); }
  } catch (e){ console.error(e); toast("Couldn't add that"); }
}
async function removePlanEntry(date, meal, id){
  const ref = doc(daysRef(), date), cur = (await getDoc(ref)).data()?.meals || {};
  await setDoc(ref, { meals: { ...cur, [meal]: (cur[meal] || []).filter(e => e.id !== id) } }, { merge: true });
}

/* ---------- family meals ---------- */
function openFamilyMealForm(id){
  S.liveSheet = null; S.view = '';
  const m = id ? S.familyMeals.find(x => x.id === id) : { date: iso(addDays(new Date(), 7 - ((new Date().getDay() + 6) % 7) - 1)), meal: 'dinner', title: '', host: S.hid, invited: Object.keys(households()), notes: '' };
  if (!m) return closeSheet();
  openSheet(`<h2>${id ? 'Edit family meal' : 'Plan a family meal'}</h2>
    <label>What is it<input id="fm_title" value="${esc(m.title)}" placeholder="e.g. Sunday roast at Mum and Dad's"></label>
    <div class="grid2"><label>Day<input id="fm_date" type="date" value="${esc(m.date)}"></label>
      <label>Meal<select id="fm_meal">${MEALS.map(x => `<option value="${x}" ${x === m.meal ? 'selected' : ''}>${MEAL_LABEL[x]}</option>`).join('')}</select></label></div>
    <label>Hosted by<select id="fm_host">${Object.keys(households()).sort().map(h => `<option value="${h}" ${h === m.host ? 'selected' : ''}>${esc(hhName(h))}</option>`).join('')}</select></label>
    <h3>Invite</h3>${Object.keys(households()).sort().map(h => `<label class="cb"><input type="checkbox" data-inv="${h}" ${(m.invited || []).includes(h) ? 'checked' : ''}> ${esc(hhName(h))}</label>`).join('')}
    <label>Notes<textarea id="fm_notes" rows="3" placeholder="Time, what to bring, anything else">${esc(m.notes || '')}</textarea></label>
    <div class="btns"><button class="btn pri" data-a="fmSave" data-id="${id || ''}">${id ? 'Save' : 'Create and invite'}</button>
      ${id && (m.host === S.hid || isAdmin()) ? `<button class="btn danger" data-a="fmDelete" data-id="${id}">Cancel this meal</button>` : ''}
      <button class="btn" data-a="closeSheet">Back</button></div>`);
}
async function saveFamilyMeal(id){
  const data = { title: $('#fm_title').value.trim(), date: $('#fm_date').value, meal: $('#fm_meal').value, host: $('#fm_host').value,
    invited: [...document.querySelectorAll('[data-inv]:checked')].map(x => x.dataset.inv), notes: $('#fm_notes').value.trim() };
  if (!data.date){ toast('Pick a day'); return; }
  if (!data.invited.includes(data.host)) data.invited.push(data.host);
  try {
    if (id) await updateDoc(doc(db, 'rxFamilyMeals', id), data);
    else { const ref = await addDoc(collection(db, 'rxFamilyMeals'), { ...data, rsvp: {}, dishes: [], createdBy: me(), created: serverTimestamp() }); id = ref.id; }
    viewFamilyMeal(id);
  } catch (e){ console.error(e); toast("Couldn't save the family meal"); }
}
function viewFamilyMeal(id){
  const m = S.familyMeals.find(x => x.id === id); if (!m){ closeSheet(); return; }
  S.view = 'fm'; S.fmId = id; S.liveSheet = null;
  const inv = [...new Set([m.host, ...(m.invited || [])])];
  const coming = inv.filter(h => (+m.rsvp?.[h] || 0) > 0);
  const people = S.people.filter(p => coming.includes(p.household));
  const needs = people.map(p => ({ p, n: needsSummary(p, p.showConditions !== false) })).filter(x => x.n.length);
  const total = coming.reduce((a, h) => a + (+m.rsvp[h] || 0), 0);
  openSheet(`<h2>${esc(m.title || 'Family ' + m.meal)}</h2>
    <p class="note">${esc(dayLong(fromIso(m.date)))} · ${esc(MEAL_LABEL[m.meal])} · hosted by ${esc(hhName(m.host))}</p>
    ${m.notes ? `<p style="white-space:pre-line">${esc(m.notes)}</p>` : ''}
    <h3>Who's coming${total ? ` · ${total} people` : ''}</h3>
    ${inv.map(h => `<div class="mini"><span class="grow">${esc(hhName(h))}${h === S.hid ? ' <span class="pill plain">you</span>' : ''}</span>
      ${h === S.hid ? `<input type="number" min="0" inputmode="numeric" value="${esc(m.rsvp?.[h] ?? '')}" placeholder="how many" data-a-change="fmRsvp" data-id="${m.id}" style="max-width:110px" aria-label="How many from your household">`
        : `<span class="note">${m.rsvp?.[h] == null ? 'not answered' : +m.rsvp[h] ? `${m.rsvp[h]} coming` : 'not coming'}</span>`}</div>`).join('')}
    <h3>Dishes</h3>
    ${(m.dishes || []).length ? (m.dishes || []).map(d => {
      const r = recipeById(d.recipeId), flags = r ? checkRecipe(r.ingredients, people) : [];
      return `<div class="mini"><span class="grow"><b ${r ? `data-a="viewRecipe" data-id="${r.id}" style="cursor:pointer"` : ''}>${esc(d.title)}</b> <span class="note">from ${esc(hhName(d.hid))}${d.servings ? ` · serves ${d.servings}` : ''}</span>
        ${flags.length ? `<br><small class="warntext">${flags.slice(0, 4).map(f => `${esc(f.person)}: ${esc(f.label)}`).join(' · ')}${flags.length > 4 ? ' …' : ''}</small>` : ''}</span>
        ${d.hid === S.hid ? `<button class="btn sm danger" data-a="fmDishDel" data-id="${m.id}" data-d="${d.id}" aria-label="Remove">✕</button>` : ''}</div>`; }).join('')
      : '<p class="note">Nothing yet. Say what your household will bring, so the meal comes together.</p>'}
    <div class="btns" style="margin-top:6px"><button class="btn sm tag" data-a="fmDish" data-id="${m.id}">+ We'll bring a dish</button></div>
    <h3>Dietary needs of the people coming</h3>
    ${!coming.length ? '<p class="note">Shown once households say how many are coming.</p>' : needs.length ? needs.map(x => `<div class="mini"><span class="grow"><b>${esc(x.p.name)}</b> <span class="note">${esc(hhName(x.p.household))}</span><br><small>${x.n.map(esc).join(' · ')}</small></span></div>`).join('')
      : '<p class="note">No dietary needs recorded for the people coming.</p>'}
    <div class="btns"><button class="btn" data-a="fmEdit" data-id="${m.id}">Edit</button><button class="btn pri" data-a="closeSheet">Done</button></div>`);
}
function openDishPick(fmId){
  S.view = ''; S.liveSheet = null; S.pa = { fmId, recipeId: '' };
  openSheet(`<h2>What will you bring?</h2>
    <label>Recipe<input id="pa_q" placeholder="Search family recipes" autocomplete="off"></label><div id="pa_list" class="pick"></div>
    <label>…or just write it<input id="pa_text" placeholder="e.g. Pavlova, Drinks, Bread rolls"></label>
    <label>Enough for how many<input id="pa_serves" type="number" min="1" inputmode="numeric" value="8"></label>
    <div class="btns"><button class="btn pri" data-a="fmDishSave">Add</button><button class="btn" data-a="viewFm" data-id="${fmId}">Back</button></div>`);
  drawPaList();
}
async function saveDish(){
  const m = S.familyMeals.find(x => x.id === S.pa.fmId); if (!m) return;
  const rid = document.querySelector('input[name=pa_r]:checked')?.value || '', text = $('#pa_text').value.trim();
  if (!rid && !text){ toast('Pick a recipe or write something'); return; }
  const dish = { id: uid8(), hid: S.hid, servings: +$('#pa_serves').value || null, by: me().name, ...(rid ? { recipeId: rid, title: recipeById(rid)?.title || '' } : { title: text }) };
  try { await updateDoc(doc(db, 'rxFamilyMeals', m.id), { dishes: [...(m.dishes || []), dish] }); viewFamilyMeal(m.id); }
  catch (e){ console.error(e); toast("Couldn't add the dish"); }
}

/* ---------- shopping list & Send to Shop ---------- */
const pantryList = () => S.household.pantry || DEFAULT_PANTRY;
function openShopDays(){
  S.view = ''; S.liveSheet = null;
  const days = weekDays(S.week), today = iso(new Date());
  openSheet(`<h2>Shopping list</h2><p class="note">Which days are you shopping for? Leftovers are skipped. Dishes you're bringing to family meals are included.</p>
    ${days.map(d => { const k = iso(d), n = MEALS.reduce((a, m) => a + (S.days[k]?.meals?.[m] || []).filter(e => e.recipeId && !e.leftover).length, 0)
      + myFamilyMeals().filter(m => m.date === k).reduce((a, m) => a + (m.dishes || []).filter(x => x.hid === S.hid && x.recipeId).length, 0);
      return `<label class="cb"><input type="checkbox" data-day="${k}" ${k >= today && n ? 'checked' : ''} ${n ? '' : 'disabled'}> <span>${esc(dayLong(d))}<small>${n ? `${n} recipe${n > 1 ? 's' : ''}` : 'nothing to buy'}</small></span></label>`; }).join('')}
    <div class="btns"><button class="btn pri" data-a="shopBuild">Make the list</button><button class="btn" data-a="closeSheet">Cancel</button></div>`);
}
async function buildShopList(){
  const chosen = [...document.querySelectorAll('[data-day]:checked')].map(x => x.dataset.day);
  if (!chosen.length){ toast('Tick at least one day'); return; }
  const entries = [];
  for (const k of chosen){
    const d = fromIso(k);
    for (const m of MEALS) for (const e of S.days[k]?.meals?.[m] || [])
      if (e.recipeId && !e.leftover) entries.push({ recipe: recipeById(e.recipeId), servings: e.servings, label: `${recipeById(e.recipeId)?.title || e.title} (${dayShort(d)})` });
    for (const fm of myFamilyMeals().filter(x => x.date === k)) for (const dish of (fm.dishes || []).filter(x => x.hid === S.hid && x.recipeId))
      entries.push({ recipe: recipeById(dish.recipeId), servings: dish.servings, label: `${dish.title} for ${fm.title || 'family meal'} (${dayShort(d)})` });
  }
  const list = shoppingList(entries, { pantry: pantryList() });
  let shopItems = [], cats = null;
  if (isAdmin()){
    try {
      const [items, settings] = await Promise.all([getDocs(collection(db, 'items')), getDoc(doc(db, 'meta', 'settings'))]);
      shopItems = items.docs.map(d => ({ id: d.id, ...d.data() })); cats = settings.data()?.cats || null;
    } catch (e){ console.error(e); toast("Couldn't read the Shop list. You can still copy it."); }
  }
  S.shop = { items: shopItems, cats, rows: list.map(x => {
    const m = shopItems.length ? matchShop(x.name, shopItems) : null;
    return { ...x, on: false, matchId: m?.item.id || '', cat: guessCategory(x.name, cats) };   // nothing ticked: you tick what you need
  }) };
  drawShopList();
}
function drawShopList(){
  const { rows, items, cats } = S.shop, canSend = isAdmin() && items.length;
  const byId = id => items.find(i => i.id === id);
  const row = (x, n) => {
    const it = x.matchId && byId(x.matchId);
    return `<div class="srow ${x.on ? '' : 'off'}"><input type="checkbox" data-a="srOn" data-n="${n}" ${x.on ? 'checked' : ''} aria-label="Include ${esc(x.name)}">
      <div class="grow"><input class="sname" value="${esc(x.name)}" data-a-change="srName" data-n="${n}" aria-label="Item name">
        <small>${esc(x.amountText || 'amount not given')} · ${esc(x.from.join(', '))}</small>
        ${canSend ? `<small>${it ? `→ Shop: <b>${esc(it.name)}</b>${it.onList ? (it.ticked ? ' (ticked, will untick)' : ' (already on the list, adds a note)') : ''} <button class="link" data-a="srNew" data-n="${n}">make it a new item</button>`
          : `→ new Shop item in <select data-a-change="srCat" data-n="${n}" aria-label="Shop category">${(cats || [x.cat]).map(c => `<option ${c === x.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`}</small>` : ''}</div></div>`;
  };
  const main = rows.map((x, n) => ({ x, n })).filter(r => !r.x.pantry), pantry = rows.map((x, n) => ({ x, n })).filter(r => r.x.pantry);
  const count = rows.filter(x => x.on).length;
  openSheet(`<h2>Shopping list</h2>
    <p class="note">Tick what you need to buy. Amounts are added up across recipes and scaled to the servings you planned.</p>
    <div class="btns" style="margin-top:4px"><button class="btn sm" data-a="srAll">Tick all</button><button class="btn sm" data-a="srNone">None</button></div>
    ${main.map(r => row(r.x, r.n)).join('') || '<p class="note">Nothing to buy.</p>'}
    ${pantry.length ? `<h3>Usually in the cupboard</h3>${pantry.map(r => row(r.x, r.n)).join('')}` : ''}
    <div class="btns"><button class="btn sm" data-a="pantryEdit">Edit cupboard staples</button></div>
    <div class="btns">${canSend ? `<button class="btn pri" data-a="shopSend" ${count ? '' : 'disabled'}>Send ${count} to Shop</button>` : ''}
      <button class="btn ${canSend ? '' : 'pri'}" data-a="shopCopy">Copy list</button>${navigator.share ? '<button class="btn" data-a="shopShare">Share</button>' : ''}
      <button class="btn" data-a="closeSheet">Close</button></div>
    ${isAdmin() ? '' : '<p class="note">Sending straight to Shop is only set up for one household so far. Copy or share the list instead.</p>'}`);
}
const listText = () => S.shop.rows.filter(x => x.on).map(x => `• ${x.name}${x.amountText ? ` (${x.amountText})` : ''}`).join('\n');
async function sendToShop(){
  const picked = S.shop.rows.filter(x => x.on); if (!picked.length) return;
  const b = writeBatch(db), who = me();
  let added = 0, noted = 0;
  // rows that go to the same Shop item ("Onion" and "Red onion" → Onion) become one write with both notes
  const groups = new Map();
  for (const x of picked){ const k = x.matchId || 'new:' + x.name.toLowerCase(); const g = groups.get(k); if (g) g.push(x); else groups.set(k, [x]); }
  for (const g of groups.values()){
    const x = g[0];
    const note = g.map(y => `${y.amountText ? (g.length > 1 ? y.name + ' ' : '') + y.amountText + ' · ' : ''}for ${y.from.join(', ')}`).join('; ').slice(0, 300);
    const it = x.matchId && S.shop.items.find(i => i.id === x.matchId);
    if (it){
      if (it.onList){
        const upd = { note: it.note ? `${it.note}; ${note}` : note };
        if (it.ticked){ upd.ticked = false; upd.tickedBy = deleteField(); }
        b.update(doc(db, 'items', it.id), upd); noted++;
      } else {
        b.update(doc(db, 'items', it.id), { onList: true, ticked: false, urgent: false, addedBy: who, tickedBy: deleteField(), note }); added++;
      }
    } else {
      b.set(doc(collection(db, 'items')), { name: x.name, cat: x.cat || 'Other', misc: false, onList: true, ticked: false, urgent: false, addedBy: who,
        qty: '', note, count: 0, pos: {}, created: serverTimestamp() }); added++;
    }
  }
  try { await b.commit(); closeSheet(); toast(`Sent to Shop: ${added} added${noted ? `, ${noted} already on the list (note added)` : ''}`); }
  catch (e){ console.error(e); toast("Couldn't send to Shop"); }
}
function openPantry(){
  openSheet(`<h2>Cupboard staples</h2><p class="note">Things your household usually has, one per line. They're unticked on shopping lists, so they only go to Shop if you tick them.</p>
    <label>Staples<textarea id="pantryTxt" rows="10">${esc(pantryList().join('\n'))}</textarea></label>
    <div class="btns"><button class="btn pri" data-a="pantrySave">Save</button><button class="btn" data-a="pantryBack">Back</button></div>`);
}

/* ---------- import from Paprika ---------- */
const normTitle = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// the browser button: runs on a recipe page, reads its recipe data (or its text) and opens this app with it
const APP_URL = () => location.origin + location.pathname;
function bookmarklet(){
  const code = `(()=>{let r=null;const f=o=>{if(!o||typeof o!='object')return null;const t=o['@type'];if(t==='Recipe'||(Array.isArray(t)&&t.includes('Recipe')))return o;for(const v of Array.isArray(o)?o:Object.values(o)){const x=f(v);if(x)return x}return null};`
    + `for(const s of document.querySelectorAll('script[type="application/ld+json"]')){try{r=f(JSON.parse(s.textContent));if(r)break}catch(e){}}`
    + `if(r){r=Object.assign({},r);['review','comment','aggregateRating','video','interactionStatistic'].forEach(k=>delete r[k])}`
    + `const d={url:location.href,title:document.title,ld:r,text:r?'':document.body.innerText.slice(0,30000)};`
    + `const u='${APP_URL()}#import='+encodeURIComponent(JSON.stringify(d));if(!window.open(u))location.href=u})()`;
  return 'javascript:' + code;
}
function openImport(){
  S.liveSheet = null; S.view = ''; S.importList = null; S.imPhotos = null;
  const ai = getAi(), ready = aiReady(ai);
  openSheet(`<h2>Add recipes</h2>
    <p class="note">${usingFamily(ai) ? `Using the family AI (up to ${+S.access.ai?.dailyLimit || 20} reads a day each).` : ready ? `AI on this phone: ${esc(PROVIDERS[ai.provider])}.` : 'No AI on this phone, so photos and links use the free Copy prompt route.'}</p>
    <h3>From a web page</h3>
    <label>Recipe link<input id="im_url" type="url" inputmode="url" placeholder="https://…" autocomplete="off"></label>
    <div class="btns" style="margin-top:6px"><button class="btn tag" data-a="imUrl">${canReadLinks(ai) ? 'Read the page' : 'Copy prompt for a chatbot'}</button></div>
    <details class="sub-d"><summary>Browser button: one tap on any recipe page (free)</summary>
      <p class="note">Most recipe sites include the recipe in a standard form. This button reads it straight off the page, with no AI needed. For other pages it brings the page text across.</p>
      <p><b>On a computer:</b> drag this to your bookmarks bar: <a class="btn sm tag" href="${esc(bookmarklet())}" onclick="return false">Save to Recipes</a></p>
      <p><b>On a phone:</b> 1. Bookmark any page. 2. <button class="link" data-a="imCopyBm">Copy the button code</button>. 3. Edit the bookmark: name it <b>Save to Recipes</b> and paste the code over its address.
        Then on a recipe page, <b>Android Chrome:</b> type “Save to Recipes” in the address bar and tap the bookmark. <b>iPhone Safari:</b> open Bookmarks and tap it.</p>
      <p class="note">On Android you can also Share a recipe page to this app once it's installed.</p>
    </details>
    <h3>From a photo</h3>
    <p class="note">A cookbook page, a magazine or a handwritten family card. Several photos for a long recipe are fine.</p>
    <input type="file" id="im_photo" accept="image/*" multiple hidden>
    <div class="btns" style="margin-top:6px"><button class="btn tag" data-a="imPhotoPick">${ready ? 'Take or choose photos' : 'Choose photos'}</button>
      ${ready ? '' : '<button class="btn" data-a="imPhotoPrompt">Copy prompt for a chatbot</button>'}</div>
    <h3>Paste the recipe text</h3>
    <label>Text<textarea id="im_text" rows="5" placeholder="Paste a recipe from an email, a message, a website…"></textarea></label>
    <div class="btns" style="margin-top:6px">${ready ? '<button class="btn tag" data-a="imText">Read it</button>' : ''}<button class="btn" data-a="imTextPrompt">Copy prompt for a chatbot</button></div>
    <details class="sub-d" id="im_replybox"><summary>Paste a chatbot's reply</summary>
      <p class="note">Used the Copy prompt route? Paste the chatbot's whole answer here.</p>
      <label>Reply<textarea id="im_reply" rows="5"></textarea></label>
      <div class="btns" style="margin-top:6px"><button class="btn tag" data-a="imReply">Use this reply</button></div></details>
    <p class="note" id="im_status" role="status"></p>
    <h3>From Paprika</h3>
    <p class="note">In Paprika, choose Export, pick the recipes (or all of them) and save the <b>.paprikarecipes</b> file. Then choose it here. Photos, ratings, categories, times and source links come across. Nothing is saved until you press Import.</p>
    <input type="file" id="imp_file" accept=".paprikarecipes,application/zip" hidden>
    <div class="btns"><button class="btn" data-a="impPick">Choose Paprika file</button><button class="btn" data-a="closeSheet">Close</button></div>
    <p class="note" id="impStatus"></p>`);
}
const imStatus = m => { const s = $('#im_status'); if (s) s.textContent = m; else if (m) toast(m); };
async function runAi(input, from, extra = {}){
  imStatus('Reading the recipe… this can take up to a minute.');
  document.querySelectorAll('.panel [data-a^=im]').forEach(b => b.disabled = true);
  try {
    const j = await extractRecipe(input);
    if (j.found === false){ imStatus("No recipe found there. Try a clearer photo, or paste the text."); return; }
    openRecipeForm(null, { ...fromAi(j, input.url || ''), from, ...extra });
  } catch (e){ console.error(e); imStatus(e.message || 'Something went wrong.'); }
  finally { document.querySelectorAll('.panel [data-a^=im]').forEach(b => b.disabled = false); }
}
async function copyForChatbot(kind, opts, hint){
  try { await navigator.clipboard.writeText(copyPrompt(kind, opts)); } catch (e){ toast("Couldn't copy"); return; }
  const box = $('#im_replybox'); if (box) box.open = true;
  imStatus(hint);
}
async function photosChosen(files){
  imStatus('Getting the photos ready…');
  try {
    const imgs = [];
    for (const f of [...files].slice(0, 4)) imgs.push(await resizeImage(f, 1600, 0.85));
    const thumb = await resizeImage(files[0], 900, 0.72);   // kept as the recipe's photo
    if (aiReady()) runAi({ images: imgs }, 'a photo', { photo: thumb });
    else { S.imPhotos = { thumb }; imStatus(`${imgs.length} photo${imgs.length > 1 ? 's' : ''} ready. Tap Copy prompt, attach the same photo in your chatbot, then paste its reply below.`); }
  } catch (e){ imStatus(e.message); }
}
// arriving from the browser button (#import=…) or Android's Share menu (?url= / ?text=)
function incomingImport(){
  let data = null;
  try {
    if (location.hash.startsWith('#import=')) data = JSON.parse(decodeURIComponent(location.hash.slice(8)));
    else {
      const p = new URLSearchParams(location.search), text = p.get('text') || '', url = p.get('url') || (text.match(/https?:\/\/\S+/) || [])[0] || '';
      if (url || text) data = { url, text: url ? '' : text, title: p.get('title') || '', shared: true };
    }
  } catch (e){ console.error(e); toast("Couldn't read what was sent to the app"); }
  if (!data) return;
  history.replaceState(null, '', location.pathname + (new URLSearchParams(location.search).has('emu') ? '?emu' : ''));
  S.tab = 'recipes'; render();
  const recipe = data.ld && findRecipe(data.ld);
  if (recipe){ openRecipeForm(null, { ...fromJsonLd(recipe, data.url), from: hostOf(data.url) || 'the web page' }); return; }
  openImport();
  if (data.url) $('#im_url').value = data.url;
  if (data.text) $('#im_text').value = (data.title ? data.title + '\n\n' : '') + data.text;
  if (data.url && !data.text && canReadLinks()) runAi({ url: data.url }, hostOf(data.url));
  else if (data.text && aiReady()) runAi({ text: $('#im_text').value, url: data.url }, hostOf(data.url) || 'the page text');
  else imStatus(data.text ? "This page didn't include recipe data, so its text is below. Use Copy prompt, or tidy it up yourself." : 'Use Copy prompt with any chatbot, then paste its reply.');
}
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
async function loadImportFile(file){
  $('#impStatus').textContent = 'Reading…';
  try {
    const { recipes, skipped } = await readPaprika(await file.arrayBuffer());
    const byUid = new Set(S.recipes.map(r => r.source?.paprikaUid).filter(Boolean)), byTitle = new Set(S.recipes.map(r => normTitle(r.title)));
    S.importList = { file: file.name, skipped, items: recipes.map(x => {
      const dupe = (x.uid && byUid.has(x.uid)) || byTitle.has(normTitle(x.title));
      return { ...x, dupe, on: !dupe };
    }) };
    drawImport();
  } catch (e){ console.error(e); $('#impStatus').textContent = e.message || "Couldn't read that file."; }
}
function drawImportCount(){
  const n = S.importList.items.filter(x => x.on).length, b = $('#impGoBtn');
  if (b){ b.textContent = `Import ${n} recipe${n === 1 ? '' : 's'}`; b.disabled = !n; }
}
function drawImport(){
  const L = S.importList, dupes = L.items.filter(x => x.dupe).length;
  openSheet(`<h2>Import from Paprika</h2>
    <p class="note">${L.items.length} recipes in ${esc(L.file)}.${dupes ? ` ${dupes} already in the book and unticked.` : ''}${L.skipped.length ? ` ${L.skipped.length} couldn't be read.` : ''}
      Categories marked <i>guess</i> had none in Paprika, so they were guessed from the title. You can change them after importing. Your Paprika stars become your rating.</p>
    <div class="btns" style="margin-top:6px"><button class="btn sm" data-a="impAll">All new</button><button class="btn sm" data-a="impNone">None</button></div>
    ${L.items.map((x, n) => `<label class="cb imp"><input type="checkbox" data-a="impToggle" data-n="${n}" ${x.on ? 'checked' : ''}>
      <span>${esc(x.title)}${x.dupe ? ' <span class="pill warn">already in book</span>' : ''}
      <small>${[...x.recipe.cats.map(c => c + (x.guessed ? ' (guess)' : '')), ...x.recipe.tags.map(t => '#' + t)].map(esc).join(' · ') || 'No category'}${x.stars ? ' · ' + '★'.repeat(x.stars) : ''}${x.photo ? ' · photo' : ''}${x.recipe.nutrition ? ' · nutrition' : ''}</small></span></label>`).join('')}
    <p class="note" id="impStatus"></p>
    <div class="btns"><button class="btn pri" id="impGoBtn" data-a="impGo"></button><button class="btn" data-a="closeSheet">Cancel</button></div>`);
  drawImportCount();
}
async function runImport(){
  const items = S.importList.items.filter(x => x.on); if (!items.length) return;
  const btn = $('#impGoBtn'), status = m => { const s = $('#impStatus'); if (s) s.textContent = m; };
  btn.disabled = true;
  let done = 0;
  try {
    for (let i = 0; i < items.length; i += 15){   // small batches keep each write well under Firestore's request size limit
      const b = writeBatch(db);
      for (const x of items.slice(i, i + 15)){
        const ref = doc(collection(db, 'rxRecipes'));
        b.set(ref, { ...x.recipe, hasPhoto: !!x.photo, stars: x.stars ? { [S.user.uid]: x.stars } : {},
          createdBy: me(), created: serverTimestamp(), updated: serverTimestamp() });
        if (x.photo) b.set(doc(db, 'rxPhotos', ref.id), { data: x.photo });
      }
      await b.commit();
      done = Math.min(items.length, i + 15); status(`Imported ${done} of ${items.length}…`);
    }
    closeSheet(); S.tab = 'recipes'; render(); toast(`Imported ${done} recipe${done === 1 ? '' : 's'}`);
  } catch (e){
    console.error(e); btn.disabled = false;
    status(`Stopped after ${done} of ${items.length}: ${e.message}. Choose the file again to import the rest; recipes already imported will be unticked.`);
  }
}

/* ---------- settings ---------- */
function openSettings(){
  S.liveSheet = null; S.view = 'settings';   // redrawn only when access/family changes
  setTimeout(drawAiFields, 0);
  const hs = households(), members = Object.entries(S.access.members || {}).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  const shop = S.access.shop || [];
  openSheet(`<h2>Settings</h2>
    <h3>Your household</h3><p class="note">${esc(hhName(S.hid))}. You manage its people and dietary needs on the Family tab.</p>
    ${isAdmin() ? `
    <h3>Households</h3>
    ${Object.keys(hs).sort().map(h => `<div class="mini"><input value="${esc(hs[h])}" data-a-change="renameHh" data-h="${h}" aria-label="Household name"></div>`).join('')}
    <div class="mini"><input id="newHh" placeholder="Add a household, e.g. Mum and Dad"><button class="btn sm pri" data-a="addHh">Add</button></div>
    <h3>Who can use the app</h3>
    <p class="note">Each person signs in with their own Google account. They see the family recipes and their own household's plans. Only Shop accounts can see Shop.</p>
    ${members.map(([e, h]) => `<div class="mini"><span class="grow">${esc(e)}${shop.includes(e) ? ' <span class="pill plain">Shop</span>' : ''}</span>
      <select data-a-change="memberHh" data-e="${esc(e)}" aria-label="Household for ${esc(e)}">${Object.keys(hs).sort().map(x => `<option value="${x}" ${x === h ? 'selected' : ''}>${esc(hs[x])}</option>`).join('')}</select>
      ${shop.includes(e) ? '' : `<button class="btn sm danger" data-a="delMember" data-e="${esc(e)}" aria-label="Remove ${esc(e)}">✕</button>`}</div>`).join('')}
    <div class="mini"><input id="newEmail" type="email" placeholder="their.email@gmail.com" autocomplete="off">
      <select id="newEmailHh" aria-label="Household">${Object.keys(hs).sort().map(x => `<option value="${x}">${esc(hs[x])}</option>`).join('')}</select>
      <button class="btn sm pri" data-a="addMember">Add</button></div>` : ''}
    ${standalone() ? '' : `<h3>App</h3><p class="note">Install Recipes so it opens full screen and shows up in your phone's app search, like Shop.</p>
    <div class="btns" style="margin-top:6px"><button class="btn sm" data-a="install">Install as an app</button></div>`}
    ${isAdmin() ? `<h3>Family AI (shared key)</h3>
    <p class="note">Lets everyone read recipes from photos, links and text using the family's Claude key, which is kept on the server. Each person has a daily limit; set a monthly spend limit on the key in the Claude Console too.</p>
    <label class="cb"><input type="checkbox" data-a-change="famAi" ${S.access.ai?.enabled ? 'checked' : ''}> <span>Family AI on</span></label>
    <div class="mini"><span class="grow">Recipe reads per person per day</span><input type="number" min="1" max="200" inputmode="numeric" value="${+S.access.ai?.dailyLimit || 20}" data-a-change="famLimit" style="max-width:90px" aria-label="Daily limit"></div>`
    : S.access.ai?.enabled ? `<h3>Family AI</h3><p class="note">On. You can read up to ${+S.access.ai?.dailyLimit || 20} recipes a day from photos, links and text.</p>` : ''}
    <h3>${S.access.ai?.enabled ? 'Your own AI key (optional)' : 'AI for photos and links (this phone only)'}</h3>
    <p class="note">${S.access.ai?.enabled ? "Not needed while the family AI is on. If you add one, this phone uses it instead." : 'Optional. Without a key you can still use the free Copy prompt route with any chatbot.'} A key is stored on this phone only, never in the family database. Use a key with a monthly spend limit.</p>
    <label>AI service<select id="ai_p"><option value="">None</option>${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}" ${getAi().provider === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
    <div id="ai_fields"></div>
    <div class="btns" style="margin-top:6px"><button class="btn sm pri" data-a="aiSave">Save</button>${aiReady() ? '<button class="btn sm danger" data-a="aiRemove">Remove key</button>' : ''}
      ${(() => { try { return localStorage.getItem('anthropicKey') && !aiReady() ? '<button class="btn sm" data-a="aiShopKey">Use the key from Shop</button>' : ''; } catch { return ''; } })()}</div>
    <h3>Account</h3><p class="note">${esc(S.user.email)}. Signing out here also signs you out of Shop on this device.</p>
    <div class="btns"><button class="btn" data-a="signout">Sign out</button><button class="btn pri" data-a="closeSheet">Done</button></div>`);
}
function drawAiFields(){
  const box = $('#ai_fields'); if (!box) return;
  const p = $('#ai_p').value, cur = getAi(), same = cur.provider === p;
  const key = same ? cur.key : '';
  box.innerHTML = !p ? '' : `
    <label>API key<input id="ai_key" type="password" autocomplete="off" value="${esc(key)}" placeholder="${p === 'anthropic' ? 'sk-ant-…' : 'paste the key'}"></label>
    ${p === 'anthropic' ? `<label>Model<select id="ai_model">${CLAUDE_MODELS.map(([v, l]) => `<option value="${v}" ${(same ? cur.model : '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <p class="note">Get a key at platform.claude.com, and set a monthly limit there. Claude can also read recipe links directly.</p>`
    : `<label>Model name<input id="ai_model" value="${esc(same ? cur.model : '')}" placeholder="${p === 'gemini' ? 'e.g. a current Gemini Flash model' : 'e.g. a current GPT mini model'}"></label>
      ${p === 'openai' ? `<label>Address<input id="ai_base" value="${esc(same ? cur.base || '' : '')}" placeholder="https://api.openai.com/v1"></label>` : ''}
      <p class="note">Reads photos and pasted text. Reading recipe links needs Claude; otherwise use the browser button.</p>`}`;
}
async function adminWrite(fn, ok){
  try { await fn(); if (ok) toast(ok); } catch (e){ console.error(e); toast("Couldn't save that change"); }
}

/* ---------- actions ---------- */
const A = {
  tab: t => { S.tab = t.dataset.tab; LS.set('tab', S.tab); render(); },
  closeSheet, settings: openSettings, install,
  signout: () => { closeSheet(); signOut(auth); },
  addRecipe: () => openRecipeForm(null),
  viewRecipe: t => viewRecipe(t.dataset.id),
  editRecipe: t => openRecipeForm(t.dataset.id),
  saveRecipe,
  delRecipe: async t => { const r = S.recipes.find(x => x.id === t.dataset.id);
    if (!r || !confirm(`Delete “${r.title}” for the whole family? This can't be undone.`)) return;
    try { await deleteDoc(doc(db, 'rxRecipes', r.id)); if (r.hasPhoto) deleteDoc(doc(db, 'rxPhotos', r.id)).catch(() => {}); closeSheet(); toast('Deleted'); } catch (e){ toast("Couldn't delete"); } },
  rate: async t => { try { await updateDoc(doc(db, 'rxRecipes', t.dataset.id), new FieldPath('stars', S.user.uid), +t.dataset.n || deleteField()); } catch (e){ toast("Couldn't save your rating"); } },
  weekPrev: () => { S.week = addDays(S.week, -7); watchWeek(); render(); },
  weekNext: () => { S.week = addDays(S.week, 7); watchWeek(); render(); },
  weekNow: () => { S.week = weekStart(new Date()); watchWeek(); render(); },
  planAdd: t => openPlanAdd({ date: t.dataset.d }),
  planRecipe: t => openPlanAdd({ recipeId: t.dataset.id }),
  paSave: savePlanAdd,
  planDel: async t => { try { await removePlanEntry(t.dataset.d, t.dataset.meal, t.dataset.e); } catch (e){ toast("Couldn't remove"); } },
  newFamilyMeal: () => openFamilyMealForm(null),
  viewFm: t => viewFamilyMeal(t.dataset.id),
  fmEdit: t => openFamilyMealForm(t.dataset.id),
  fmSave: t => saveFamilyMeal(t.dataset.id || null),
  fmDelete: async t => { if (!confirm('Cancel this family meal for everyone?')) return;
    try { await deleteDoc(doc(db, 'rxFamilyMeals', t.dataset.id)); closeSheet(); toast('Family meal cancelled'); } catch (e){ toast("Couldn't cancel it"); } },
  fmDish: t => openDishPick(t.dataset.id),
  fmDishSave: saveDish,
  fmDishDel: async t => { const m = S.familyMeals.find(x => x.id === t.dataset.id);
    try { await updateDoc(doc(db, 'rxFamilyMeals', m.id), { dishes: (m.dishes || []).filter(d => d.id !== t.dataset.d) }); } catch (e){ toast("Couldn't remove"); } },
  shopList: openShopDays,
  shopBuild: buildShopList,
  srOn: t => { S.shop.rows[+t.dataset.n].on = t.checked; t.closest('.srow').classList.toggle('off', !t.checked);
    const c = S.shop.rows.filter(x => x.on).length, b = document.querySelector('[data-a=shopSend]'); if (b){ b.textContent = `Send ${c} to Shop`; b.disabled = !c; } },
  srAll: () => { S.shop.rows.forEach(x => { if (!x.pantry) x.on = true; }); drawShopList(); },
  srNone: () => { S.shop.rows.forEach(x => { x.on = false; }); drawShopList(); },
  srNew: t => { S.shop.rows[+t.dataset.n].matchId = ''; drawShopList(); },
  shopSend: sendToShop,
  shopCopy: async () => { try { await navigator.clipboard.writeText(listText()); toast('List copied'); } catch (e){ toast("Couldn't copy"); } },
  shopShare: () => navigator.share({ title: 'Shopping list', text: listText() }).catch(() => {}),
  pantryEdit: openPantry,
  pantryBack: drawShopList,
  pantrySave: async () => {
    const list = $('#pantryTxt').value.split('\n').map(x => x.trim()).filter(Boolean);
    try { await setDoc(doc(db, 'rxHouseholds', S.hid), { pantry: list }, { merge: true }); S.household.pantry = list;
      S.shop.rows.forEach(x => { const p = isPantry(x.name, list); if (p !== x.pantry){ x.pantry = p; if (p) x.on = false; } }); drawShopList(); toast('Staples saved'); }
    catch (e){ console.error(e); toast("Couldn't save"); } },
  nutView: t => { S.nutView = t.dataset.v; S.liveSheet?.(); },
  nutFix: t => openNutFix(t.dataset.id, +t.dataset.i),
  nutServes: async t => { const n = +$('#nutServes').value; if (!(n > 0)) return;
    try { await updateDoc(doc(db, 'rxRecipes', t.dataset.id), { servings: n }); } catch (e){ toast("Couldn't save"); } },
  nutChecked: async t => { const r = S.recipes.find(x => x.id === t.dataset.id);
    try { await updateDoc(doc(db, 'rxRecipes', r.id), { nutritionChecked: r.nutritionChecked ? deleteField() : { by: me().name, uid: S.user.uid, at: Date.now() } }); } catch (e){ toast("Couldn't save"); } },
  nfSave: () => { const f = document.querySelector('input[name=nfFood]:checked')?.value, g = $('#nfG').value;
    if (!f && g === ''){ toast('Pick a food or enter grams'); return; }
    saveFix({ ...(f ? { foodId: f } : {}), ...(g !== '' ? { grams: +g } : {}) }); },
  nfSkip: () => saveFix({ skip: true }),
  nfReset: () => saveFix(null),
  toggleOrig: t => { S.showOrig = S.showOrig === t.dataset.id ? null : t.dataset.id; S.liveSheet?.(); },
  importer: openImport,
  imUrl: () => { const url = $('#im_url').value.trim();
    if (!/^https?:\/\//i.test(url)){ imStatus('Paste the full link, starting with https://'); return; }
    if (canReadLinks()) runAi({ url }, hostOf(url));
    else copyForChatbot('url', { url }, aiReady() ? 'Reading links needs a Claude key, so the prompt is copied instead. Paste it into a chatbot that can open web pages, then paste its reply below. Or use the browser button.'
      : 'Prompt copied. Paste it into a chatbot that can open web pages (ChatGPT, Claude, Gemini), then paste its reply below. Or use the browser button.'); },
  imCopyBm: async () => { try { await navigator.clipboard.writeText(bookmarklet()); toast('Button code copied'); } catch (e){ toast("Couldn't copy"); } },
  imPhotoPick: () => $('#im_photo').click(),
  imPhotoPrompt: () => copyForChatbot('photo', {}, 'Prompt copied. In ChatGPT, Claude or Gemini, attach your photo, paste the prompt, then paste the reply below.'),
  imText: () => { const text = $('#im_text').value.trim(); if (!text){ imStatus('Paste a recipe first'); return; } runAi({ text }, 'pasted text'); },
  imTextPrompt: () => { const text = $('#im_text').value.trim(); if (!text){ imStatus('Paste a recipe first'); return; }
    copyForChatbot('text', { text }, 'Prompt copied, with the recipe in it. Paste it into any chatbot, then paste its reply below.'); },
  imReply: () => {
    try { const j = parseLooseJson($('#im_reply').value);
      if (j.found === false){ imStatus("The chatbot didn't find a recipe."); return; }
      openRecipeForm(null, { ...fromAi(j, $('#im_url')?.value.trim() || ''), from: 'a chatbot reply', ...(S.imPhotos ? { photo: S.imPhotos.thumb } : {}) });
    } catch (e){ imStatus(e instanceof SyntaxError ? "That reply isn't complete JSON. Copy the chatbot's whole answer." : e.message); } },
  aiSave: () => {
    const provider = $('#ai_p').value;
    if (!provider){ setAi(null); toast('AI turned off on this phone'); openSettings(); return; }
    const v = { provider, key: $('#ai_key').value.trim(), model: ($('#ai_model')?.value || '').trim(), base: ($('#ai_base')?.value || '').trim() };
    if (!v.key){ toast('Paste a key first'); return; }
    if (provider !== 'anthropic' && !v.model){ toast('Enter the model name'); return; }
    setAi(v); toast('Saved on this phone'); openSettings(); },
  aiProvider: () => drawAiFields(),
  aiShopKey: () => { try { const k = localStorage.getItem('anthropicKey'); if (k){ $('#ai_p').value = 'anthropic'; drawAiFields(); $('#ai_key').value = k; toast('Key copied from Shop. Tap Save.'); } } catch {} },
  aiRemove: () => { setAi(null); toast('Key removed from this phone'); openSettings(); },
  impPick: () => $('#imp_file').click(),
  impAll: () => { S.importList.items.forEach(x => x.on = !x.dupe); drawImport(); },
  impNone: () => { S.importList.items.forEach(x => x.on = false); drawImport(); },
  impToggle: t => { S.importList.items[+t.dataset.n].on = t.checked; drawImportCount(); },
  impGo: runImport,
  flagScope: t => { LS.set('flagScope', t.dataset.s); S.liveSheet?.(); },
  newPerson: t => openPerson(null, t.dataset.h),
  editPerson: t => openPerson(t.dataset.id),
  pPreset: t => { readPersonForm(); const p = S.editPerson, id = t.dataset.p;
    p.presets = t.checked ? [...new Set([...p.presets, id])] : p.presets.filter(x => x !== id); drawPerson(); },
  pItem: t => { readPersonForm(); const p = S.editPerson, k = t.dataset.k;
    if (t.dataset.opt){ const s = new Set(p.presetOn || []); t.checked ? s.add(k) : s.delete(k); p.presetOn = [...s]; }
    else { const s = new Set(p.presetOff || []); t.checked ? s.delete(k) : s.add(k); p.presetOff = [...s]; } },
  pAddCustom: () => { readPersonForm(); const item = $('#p_custom').value.trim(); if (!item) return;
    S.editPerson.custom = [...(S.editPerson.custom || []), { item, level: $('#p_level').value }]; drawPerson(); $('#p_custom')?.focus(); },
  pDelCustom: t => { readPersonForm(); S.editPerson.custom.splice(+t.dataset.n, 1); drawPerson(); },
  pSave: savePerson,
  pDelete: async () => { const p = S.editPerson; if (!confirm(`Remove ${p.name}?`)) return;
    try { await deleteDoc(doc(db, 'rxPeople', p.id)); closeSheet(); toast(`Removed ${p.name}`); } catch (e){ toast("Couldn't remove"); } },
  addHh: () => { const n = $('#newHh').value.trim(); if (!n) return;
    const ids = Object.keys(households()).map(h => +h.replace(/\D/g, '') || 0), id = 'hh' + (Math.max(0, ...ids) + 1);
    adminWrite(() => updateDoc(accessRef(), new FieldPath('households', id), n), `Added ${n}`); },
  addMember: () => { const e = $('#newEmail').value.trim().toLowerCase(), h = $('#newEmailHh').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){ toast('That doesn’t look like an email address'); return; }
    adminWrite(() => updateDoc(accessRef(), new FieldPath('members', e), h), `Added ${e}`); },
  delMember: t => { const e = t.dataset.e; if (!confirm(`Remove ${e} from the app?`)) return;
    adminWrite(() => updateDoc(accessRef(), new FieldPath('members', e), deleteField()), `Removed ${e}`); },
};
const CH = {
  renameHh: t => { const n = t.value.trim(); if (n) adminWrite(() => updateDoc(accessRef(), new FieldPath('households', t.dataset.h), n), 'Renamed'); },
  memberHh: t => adminWrite(() => updateDoc(accessRef(), new FieldPath('members', t.dataset.e), t.value), 'Moved'),
  pLevel: t => { readPersonForm(); S.editPerson.custom[+t.dataset.n].level = t.value; },
  fmRsvp: async t => { const v = t.value === '' ? deleteField() : Math.max(0, +t.value || 0);
    try { await updateDoc(doc(db, 'rxFamilyMeals', t.dataset.id), new FieldPath('rsvp', S.hid), v); } catch (e){ toast("Couldn't save"); } },
  famAi: t => adminWrite(() => updateDoc(accessRef(), new FieldPath('ai', 'enabled'), t.checked), t.checked ? 'Family AI on' : 'Family AI off'),
  famLimit: t => { const n = Math.min(200, Math.max(1, Math.round(+t.value) || 20)); adminWrite(() => updateDoc(accessRef(), new FieldPath('ai', 'dailyLimit'), n), 'Limit saved'); },
  srName: t => { const x = S.shop.rows[+t.dataset.n]; x.name = t.value.trim() || x.name;
    const m = S.shop.items.length ? matchShop(x.name, S.shop.items) : null; x.matchId = m?.item.id || ''; x.cat = guessCategory(x.name, S.shop.cats); drawShopList(); },
  srCat: t => { S.shop.rows[+t.dataset.n].cat = t.value; },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-a]'); if (!t) return;
  const f = A[t.dataset.a]; if (f){ if (t.tagName !== 'INPUT') e.preventDefault(); f(t, e); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.aChange && CH[t.dataset.aChange]) CH[t.dataset.aChange](t);
  if (t.id === 'rcat'){ LS.set('cat', t.value); renderRecipes(); }
  if (t.id === 'rsort') renderRecipes();
  if (t.id === 'imp_file' && t.files[0]) loadImportFile(t.files[0]);
  if (t.id === 'im_photo' && t.files.length){ const fs = [...t.files]; t.value = ''; photosChosen(fs); }
  if (t.id === 'ai_p') drawAiFields();
});
$('#rq').addEventListener('input', renderRecipes);
document.addEventListener('input', e => {
  if (e.target.id === 'nfQ'){ clearTimeout(S.nfT); S.nfT = setTimeout(drawFixResults, 200); }
  if (e.target.id === 'pa_q') drawPaList();
});
document.addEventListener('change', e => { if (e.target.name === 'nfFood') S.fix.foodId = e.target.value; });
document.addEventListener('toggle', e => { if (e.target.dataset?.nut) S.nutOpen = e.target.open ? e.target.dataset.nut : null; }, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#sheet').classList.contains('on')) closeSheet();
  if (e.key === 'Enter' && e.target.id === 'p_custom') A.pAddCustom();
  if (e.key === 'Enter' && e.target.id === 'newEmail') A.addMember();
});
