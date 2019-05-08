// End version string with '-dev' to set developer environment mode
const VERSION = 'v0.2.3',
      ENV = /-dev$/.test(VERSION) ? 'development' : 'production',
      CACHE = 'solitaire-2048';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(cache => {
      cache.addAll([
        'index.html',
        'index.js',
        'style.css'
      ]);
      cache.put(new Request('version'), new Response(VERSION))
    }).then(skipWaiting))
});

self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('fetch', e => {
  let v = !/\/version$/.test(e.request.url);
  if (ENV === 'development' && v) e.respondWith(fetch(e.request));
  else {
    e.respondWith(caches.open(CACHE)
      .then(cache => cache.match(e.request))
      .then(response => response || fetch(e.request)));
    v && e.waitUntil(caches.open(CACHE)
      .then(cache => fetch(e.request)
        .then(response => cache.put(e.request, response.clone()))))
  }
})
