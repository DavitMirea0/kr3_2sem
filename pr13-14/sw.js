const CACHE_NAME = 'softshop-shell-v4';
const DYNAMIC_CACHE = 'softshop-dynamic-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/favicon.ico',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-48x48.png',
  '/icons/favicon-64x64.png',
  '/icons/favicon-128x128.png',
  '/icons/favicon-256x256.png',
  '/icons/favicon-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== DYNAMIC_CACHE)
            .map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Dynamic content: Network First
  if (url.pathname.startsWith('/content/')) {
    event.respondWith(
      fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(DYNAMIC_CACHE).then(c => c.put(event.request, clone));
        return res;
      }).catch(() => {
        return caches.match(event.request)
          .then(c => c || caches.match('/content/home.html'));
      })
    );
    return;
  }

  // App Shell: Cache First
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  let data = { title: 'SoftShop', body: '' };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/favicon-128x128.png',
      badge: '/icons/favicon-48x48.png'
    })
  );
});
