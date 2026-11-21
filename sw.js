// Caches the app shell and Firebase SDK so the page opens offline (same approach as Shop).
// Recipe data itself is cached by Firestore's own offline persistence.
const CACHE = 'recipes-v1';
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
  e.respondWith(
    fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
