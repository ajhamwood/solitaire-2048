// End version string with '-dev' to set developer environment mode
const VERSION = 'v0.2.4.010',
      ENV = /-dev$/.test(VERSION) ? 'development' : 'production',
      CACHE = 'solitaire-2048';

self.addEventListener('install', e => e.waitUntil(caches.delete(CACHE)
  .then(() => caches.open(CACHE))
  .then(cache => {
    cache.addAll([
      registration.scope,
      new URL(registration.scope).pathname,
      'index.html',
      'index.js',
      'style.css'
    ]);
    cache.put(new Request('version'), new Response(VERSION))
  })
  .then(skipWaiting)));

self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('fetch', e => {
  let v = /\/version$/.test(e.request.url);
  e.respondWith(!v && ENV === 'development' ?
    fetch(e.request) :
    caches.open(CACHE)
      .then(cache => cache.match(e.request)
        .then(retrieved => (retrieved ? Promise.resolve(retrieved) : fetch(e.request)))
        .then(response => (v || cache.put(e.request, response.clone()), response))))
})
