const CACHE_NAME = 'synapse-cache-v3';
const STATIC_ASSETS = [
  '/',
  '/login.html',
  '/index.html',
  '/manifest.json',
  '/style/style.css',
  '/style/login.css',
  '/js/index.js',
  '/assets/circle-user-round.svg',
  '/assets/mic.svg',
  '/assets/send.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const isApi =
    request.url.includes('/messages') ||
    request.url.includes('/upload') ||
    request.url.includes('/encryption-key') ||
    request.url.includes('/socket.io');

  if (isApi) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedRes) => {
      if (cachedRes) return cachedRes;
      return fetch(request)
        .then((networkRes) => {
          if (!networkRes || networkRes.status !== 200 || networkRes.type === 'opaque') {
            if (request.mode === 'navigate') {
              return caches.match('/login.html') || caches.match('/index.html');
            }
            return networkRes;
          }
          const responseClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return networkRes;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('/login.html') || caches.match('/index.html');
          }
          return caches.match(request);
        });
    })
  );
});
