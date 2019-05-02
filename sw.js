const VERSION = 'v0.2.1',
      ENV = 'production',
      CACHE = 'solitaire-2048';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll([
      'index.html',
      'index.js',
      'style.css'
    ])).then(skipWaiting))
});

self.addEventListener('activate', e => e.waitUntil(clients.claim));

self.addEventListener('fetch', e => {
  if (ENV === 'development') e.respondWith(fetch(e.request));
  else if (ENV === 'production') {
    e.respondWith(caches.open(CACHE)
      .then(cache => cache.match(e.request))
      .then(response => response || fetch(e.request)));
    e.waitUntil(caches.open(CACHE)
      .then(cache => fetch(e.request)
        .then(response => cache.put(e.request, response.clone()))))
  }
})
