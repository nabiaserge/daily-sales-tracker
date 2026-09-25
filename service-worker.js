const CACHE_NAME = 'suivi-ventes-shell-v4';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/privacy.html', '/assets/offline-store.js', '/assets/pagination.js', '/assets/operations.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

// Serve the cached copy immediately and refresh it in the background, so the app opens
// instantly on slow or absent networks and picks up new deployments on the next launch.
function staleWhileRevalidate(event, cacheKey) {
  const refresh = fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
    }
    return response;
  });
  event.waitUntil(refresh.catch(() => {}));
  return caches.match(cacheKey).then((cached) => cached || refresh);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/functions/')) return;
  if (event.request.mode === 'navigate') {
    const cacheKey = url.pathname === '/privacy.html' ? '/privacy.html' : '/index.html';
    event.respondWith(staleWhileRevalidate(event, cacheKey).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, event.request));
});
