// Caches the app shell and Firebase SDK so the page opens offline (same approach as Shop).
// Recipe data itself is cached by Firestore's own offline persistence.
const CACHE = 'recipes-v2';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('recipes-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const ok = e.request.method === 'GET' &&
    ((u.origin === location.origin && u.pathname.startsWith(new URL(self.registration.scope).pathname)) ||
     u.hostname === 'www.gstatic.com' || u.hostname.endsWith('fonts.googleapis.com') || u.hostname.endsWith('fonts.gstatic.com'));
  if (!ok) return;
  // the app's own files: always ask the site if there's a newer copy (cheap when there isn't),
  // so an update shows straight away rather than after the browser's 10-minute cache
  const mine = u.origin === location.origin;
  e.respondWith(
    // (a page load can't be re-sent with options, so it's fetched by its address)
    (!mine ? fetch(e.request) : e.request.mode === 'navigate' ? fetch(u.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request, { cache: 'no-cache' })).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
