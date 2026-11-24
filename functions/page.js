// Reads a recipe web page without AI: fetches it and pulls out the standard recipe data (JSON-LD)
// that most recipe sites include. Used by the free "Paste link" route; AI is only the backup.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DROP = ['review', 'comment', 'aggregateRating', 'video', 'interactionStatistic'];
const MAX_BYTES = 3_000_000, MAX_TEXT = 30_000, TIMEOUT = 10_000, MAX_HOPS = 5;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// same search as jsonld.js findRecipe (the functions folder is deployed on its own, so it can't import it)
export function findRecipe(ld){
  const seen = new Set(), stack = [ld];
  while (stack.length){
    const o = stack.pop();
    if (!o || typeof o !== 'object' || seen.has(o)) continue;
    seen.add(o);
    const t = o['@type'];
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return o;
    for (const v of Array.isArray(o) ? o : Object.values(o)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}

const entities = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));

// html → the page's Recipe object (without reviews and other bulk), or null
export function extractLd(html){
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of String(html).matchAll(re)){
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const r = findRecipe(j);
    if (r){ const out = { ...r }; for (const k of DROP) delete out[k]; return out; }
  }
  return null;
}
export const pageTitle = html => entities((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 300);
// html → the visible text, roughly (for the AI backup, which reads text more cheaply than fetching the page itself)
export function pageText(html){
  return entities(String(html)
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h\d|tr|section|article|header|footer)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ').replace(/ *\n[\s]*/g, '\n').trim().slice(0, MAX_TEXT);
}

// refuse anything that isn't a public web address, so the function can't be pointed at internal hosts
const privateV4 = a => { const [x, y] = a.split('.').map(Number);
  return x === 0 || x === 10 || x === 127 || (x === 100 && y >= 64 && y < 128) || (x === 169 && y === 254) || (x === 172 && y >= 16 && y < 32) || (x === 192 && y === 168) || x >= 224; };
const privateV6 = a => { const s = a.toLowerCase();
  if (s.startsWith('::ffff:')) return privateV4(s.slice(7));
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('ff'); };
export const privateIp = a => isIP(a) === 4 ? privateV4(a) : isIP(a) === 6 ? privateV6(a) : true;
export function safeUrl(raw){
  let u; try { u = new URL(String(raw)); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return null;
  if (isIP(h) && privateIp(h)) return null;
  if (u.port && !['80', '443'].includes(u.port)) return null;
  return u;
}
async function publicHost(u){
  const h = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(h)) return !privateIp(h);
  try { const all = await lookup(h, { all: true }); return all.length > 0 && all.every(a => !privateIp(a.address)); } catch { return false; }
}

// url → { ld, title, url } when the page has recipe data, { ld: null, title, text, url } when it doesn't,
// or { error: 'bad-url' | 'blocked' | 'fetch', code }
export async function readPage(raw, { fetchFn = fetch } = {}){
  let u = safeUrl(raw);
  if (!u) return { error: 'bad-url' };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    let res;
    for (let hop = 0; ; hop++){
      if (!(await publicHost(u))) return { error: 'bad-url' };
      res = await fetchFn(u.href, { redirect: 'manual', signal: ctl.signal,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-NZ,en;q=0.9' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')){
        if (hop >= MAX_HOPS) return { error: 'fetch', code: 'too many redirects' };
        u = safeUrl(new URL(res.headers.get('location'), u).href);
        if (!u) return { error: 'bad-url' };
        continue;
      }
      break;
    }
    if (!res.ok) return { error: [401, 402, 403, 406, 429, 503].includes(res.status) ? 'blocked' : 'fetch', code: res.status };
    const html = await readCapped(res);
    const ld = extractLd(html), title = pageTitle(html);
    return ld ? { ld, title, url: u.href } : { ld: null, title, text: pageText(html), url: u.href };
  } catch (e){
    return { error: 'fetch', code: e.name === 'AbortError' ? 'timed out' : e.code || e.message };
  } finally { clearTimeout(timer); }
}
async function readCapped(res){
  if (!res.body?.getReader) return (await res.text()).slice(0, MAX_BYTES);
  const reader = res.body.getReader(), parts = [];
  let n = 0;
  while (n < MAX_BYTES){
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); n += value.length;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(parts.map(p => Buffer.from(p))));
}
