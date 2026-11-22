// Helpers for the "Simple" method: tidy the AI's reply, check nothing numeric went missing,
// and make the key details (temperatures, times, sizes, amounts, "until …" cues) stand out.
//
// Why this shape (prep list, short phases, amounts in the steps, highlighted details):
//  - split attention (Chandler & Sweller 1991): putting amounts in the step saves looking back at the list
//  - segmenting and signalling (Mayer): small labelled chunks; key details made easy to spot
//  - mise en place: jobs that can be done first are gathered up front

const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = s => String(s ?? '').replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim();

// AI reply → { prep: [..], phases: [{ heading, steps: [..] }] }, or null if it has no steps
export function cleanSimple(j){
  const prep = (Array.isArray(j?.prep) ? j.prep : []).map(strip).filter(Boolean);
  const phases = (Array.isArray(j?.phases) ? j.phases : [])
    .map(p => ({ heading: String(p?.heading ?? '').trim().replace(/:$/, ''), steps: (Array.isArray(p?.steps) ? p.steps : []).map(strip).filter(Boolean) }))
    .filter(p => p.steps.length);
  return phases.length ? { prep, phases } : null;
}
export const simpleText = s => [...(s?.prep || []), ...(s?.phases || []).flatMap(p => [p.heading, ...p.steps])].join('\n');

// numbers with their unit, e.g. "180°C", "20-25 minutes", "23 cm", "½"
const FRAC = '½¼¾⅓⅔⅛';
const NUM = new RegExp(`(\\d+(?:[.,]\\d+)?(?:\\s*(?:-|–|to)\\s*\\d+(?:[.,]\\d+)?)?|[${FRAC}])\\s*(°\\s*C|°\\s*F|°|%|cm|mm|kg|g|ml|l|litres?|minutes?|mins?|hours?|hrs?|seconds?|secs?)?(?![\\w])`, 'gi');
const normNum = n => n.toLowerCase().replace(/\s*(?:–|to)\s*/g, '-').replace(/\s*-\s*/g, '-').replace(',', '.');
const normUnit = u => {
  u = (u || '').toLowerCase().replace(/\s+/g, '');
  if (/^min/.test(u)) return 'min'; if (/^(hour|hr)/.test(u)) return 'h'; if (/^sec/.test(u)) return 's';
  if (/^litre/.test(u)) return 'l'; if (u === '°') return '°c'; return u;
};
export function numbersIn(text){
  const out = [];
  for (const m of String(text || '').matchAll(NUM)) out.push({ text: m[0].trim(), num: normNum(m[1]), unit: normUnit(m[2]) });
  return out;
}
// numbers in the original method that the simple version no longer has (with the same unit when one was given)
export function missingNumbers(steps, simple){
  const have = numbersIn(simpleText(simple));
  const seen = new Set(), out = [];
  for (const n of numbersIn((steps || []).join('\n'))){
    const key = n.num + '|' + n.unit; if (seen.has(key)) continue; seen.add(key);
    const ok = have.some(h => h.num === n.num && (!n.unit || h.unit === n.unit));
    if (!ok) out.push(n.text);
  }
  return out;
}

// bold the details a cook looks for mid-recipe; returns safe HTML
const KEY = new RegExp([
  `\\d+(?:[.,]\\d+)?\\s*°\\s*[CF]?(?:\\s*fan(?:-forced)?)?`,                                    // 180°C
  `(?:\\d+(?:[.,]\\d+)?|[${FRAC}])(?:\\s*(?:-|–|to)\\s*\\d+(?:[.,]\\d+)?)?\\s*(?:minutes?|mins?|hours?|hrs?|seconds?|secs?)\\b`,   // 20-25 minutes
  `\\d+(?:[.,]\\d+)?\\s*(?:x\\s*\\d+(?:[.,]\\d+)?\\s*)?(?:cm|mm)\\b`,                             // 23 cm, 20 x 30 cm
  `(?:\\d+(?:[.,]\\d+)?|\\d+\\s*[${FRAC}]|[${FRAC}]|\\d+\\/\\d+)\\s*(?:kg|g|ml|l|litres?|tbsp|tsp|cups?|cans?|tins?)\\b(?:\\s*\\(\\d+\\s*g\\))?`,   // 2 tbsp, 1 can (400 g)
  `\\buntil\\b[^,.;:!?()]{2,60}`,                                                                 // until golden
].join('|'), 'gi');
export function highlight(text){
  const s = String(text ?? ''); let out = '', at = 0;
  for (const m of s.matchAll(KEY)){
    out += escHtml(s.slice(at, m.index)) + `<b>${escHtml(m[0].trimEnd())}</b>` + escHtml(m[0].slice(m[0].trimEnd().length));
    at = m.index + m[0].length;
  }
  return out + escHtml(s.slice(at));
}
