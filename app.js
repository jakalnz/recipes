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
  getDoc, setDoc, updateDoc, deleteDoc, addDoc, deleteField, serverTimestamp, FieldPath, connectFirestoreEmulator, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { PRESETS, LEVELS, presetById, checkRecipe, itemActive } from './diet.js';
import { readPaprika, parseIngredients, parseSteps, CATEGORIES } from './paprika.js';

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
if (EMU){
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8181);
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
  unsubs.push(onSnapshot(accessRef(), s => { S.access = s.data() || {}; S.hid = S.access.members?.[S.user.email] || ''; if (!S.hid) return notAllowed(); render(); if (S.view === 'settings') openSettings(); }, denied));
  unsubs.push(onSnapshot(collection(db, 'rxRecipes'), s => { S.recipes = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, denied));
  unsubs.push(onSnapshot(collection(db, 'rxPeople'), s => { S.people = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)); render(); }, denied));
  unsubs.push(onSnapshot(collection(db, 'rxMembers'), s => { S.members = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); }, denied));
  // keep my account record up to date
  setDoc(doc(db, 'rxMembers', S.user.uid), { name: me().name, email: S.user.email, household: S.hid, seen: serverTimestamp() }, { merge: true }).catch(denied);
  render();
}

/* ---------- render ---------- */
function render(){
  if (!S.user || !S.access) return;
  $('#hhName').textContent = hhName(S.hid);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#vRecipes').hidden = S.tab !== 'recipes'; $('#vPlan').hidden = S.tab !== 'plan'; $('#vFamily').hidden = S.tab !== 'family';
  if (S.tab === 'recipes') renderRecipes();
  if (S.tab === 'family') renderFamily();
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
function openRecipeForm(id){
  const r = id ? S.recipes.find(x => x.id === id) : { title: '', cats: [], servings: 4, ingredients: [], steps: [], notes: '', source: {} };
  if (!r) return closeSheet();
  S.liveSheet = null; S.view = '';
  openSheet(`<h2>${id ? 'Edit recipe' : 'Add a recipe'}</h2>
    <p class="note">Importing from a web link or a photo is coming. For now, type or paste it in.</p>
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
    source: { url: $('#r_url').value.trim() }, updated: serverTimestamp(),
  };
  try {
    if (id) await updateDoc(doc(db, 'rxRecipes', id), data);
    else { const ref = await addDoc(collection(db, 'rxRecipes'), { ...data, createdBy: me(), created: serverTimestamp() }); t.dataset.id = ref.id; }
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
  const NUT = [['carbs', 'Carbs', 'g'], ['sugar', 'Sugar', 'g'], ['fat', 'Fat', 'g'], ['satFat', 'Sat. fat', 'g'], ['protein', 'Protein', 'g'], ['fibre', 'Fibre', 'g'], ['kcal', 'Energy', ' kcal']];
  openSheet(`${S.photos[id] ? `<img class="hero" src="${esc(S.photos[id])}" alt="">` : ''}<h2>${esc(r.title)}</h2>
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
    ${(r.ingredients || []).length ? `<ul class="ings">${r.ingredients.map(i => i.heading ? `<li class="ih">${esc(i.original)}</li>` : `<li>${esc(i.original)}</li>`).join('')}</ul>` : '<p class="note">None yet.</p>'}
    <h3>Method</h3>
    ${(r.steps || []).length ? `<ol>${r.steps.map(s => `<li style="margin-bottom:8px">${esc(s)}</li>`).join('')}</ol>` : '<p class="note">None yet.</p>'}
    ${r.notes ? `<h3>Notes</h3><p style="white-space:pre-line">${esc(r.notes)}</p>` : ''}
    ${nut ? `<h3>Nutrition</h3><p class="note">From the website, not checked. It may be per serving or for the whole recipe, and some sites get it wrong, so don't rely on it for insulin or Creon yet.</p>
      <div class="nut">${NUT.filter(([k]) => nut[k] != null).map(([k, l, u]) => `<div><b>${esc(nut[k])}${u}</b><span>${l}</span></div>`).join('')}</div>` : ''}
    <div class="btns"><button class="btn" data-a="editRecipe" data-id="${r.id}">Edit</button>
      ${canDelete ? `<button class="btn danger" data-a="delRecipe" data-id="${r.id}">Delete</button>` : ''}
      <button class="btn pri" data-a="closeSheet">Done</button></div>`);
}

/* ---------- import from Paprika ---------- */
const normTitle = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function openImport(){
  S.liveSheet = null; S.view = ''; S.importList = null;
  openSheet(`<h2>Import recipes</h2>
    <h3>From Paprika</h3>
    <p class="note">In Paprika, choose Export, pick the recipes (or all of them) and save the <b>.paprikarecipes</b> file. Then choose it here. Photos, ratings, categories, times and source links come across. Nothing is saved until you press Import.</p>
    <input type="file" id="imp_file" accept=".paprikarecipes,application/zip" hidden>
    <div class="btns"><button class="btn tag" data-a="impPick">Choose Paprika file</button><button class="btn" data-a="closeSheet">Cancel</button></div>
    <p class="note" id="impStatus"></p>
    <h3>From a web link or photo</h3><p class="note">Coming next.</p>`);
}
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
    <h3>Account</h3><p class="note">${esc(S.user.email)}. Signing out here also signs you out of Shop on this device.</p>
    <div class="btns"><button class="btn" data-a="signout">Sign out</button><button class="btn pri" data-a="closeSheet">Done</button></div>`);
}
async function adminWrite(fn, ok){
  try { await fn(); if (ok) toast(ok); } catch (e){ console.error(e); toast("Couldn't save that change"); }
}

/* ---------- actions ---------- */
const A = {
  tab: t => { S.tab = t.dataset.tab; LS.set('tab', S.tab); render(); },
  closeSheet, settings: openSettings,
  signout: () => { closeSheet(); signOut(auth); },
  addRecipe: () => openRecipeForm(null),
  viewRecipe: t => viewRecipe(t.dataset.id),
  editRecipe: t => openRecipeForm(t.dataset.id),
  saveRecipe,
  delRecipe: async t => { const r = S.recipes.find(x => x.id === t.dataset.id);
    if (!r || !confirm(`Delete “${r.title}” for the whole family? This can't be undone.`)) return;
    try { await deleteDoc(doc(db, 'rxRecipes', r.id)); if (r.hasPhoto) deleteDoc(doc(db, 'rxPhotos', r.id)).catch(() => {}); closeSheet(); toast('Deleted'); } catch (e){ toast("Couldn't delete"); } },
  rate: async t => { try { await updateDoc(doc(db, 'rxRecipes', t.dataset.id), new FieldPath('stars', S.user.uid), +t.dataset.n || deleteField()); } catch (e){ toast("Couldn't save your rating"); } },
  importer: openImport,
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
});
$('#rq').addEventListener('input', renderRecipes);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#sheet').classList.contains('on')) closeSheet();
  if (e.key === 'Enter' && e.target.id === 'p_custom') A.pAddCustom();
  if (e.key === 'Enter' && e.target.id === 'newEmail') A.addMember();
});
