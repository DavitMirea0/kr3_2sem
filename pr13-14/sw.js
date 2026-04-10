var CACHE_NAME = 'softshop-shell-v7';
var DYNAMIC_CACHE = 'softshop-dynamic-v1';
var ASSETS = [
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

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(ASSETS); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME && k !== DYNAMIC_CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.indexOf('/content/') === 0) {
    event.respondWith(
      fetch(event.request).then(function(res) {
        var clone = res.clone();
        caches.open(DYNAMIC_CACHE).then(function(c) { c.put(event.request, clone); });
        return res;
      }).catch(function() {
        return caches.match(event.request).then(function(c) {
          return c || caches.match('/content/home.html');
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(r) { return r || fetch(event.request); })
  );
});

self.addEventListener('push', function(event) {
  var data = { title: 'SoftShop', body: '', reminderId: null };
  if (event.data) {
    try { data = event.data.json(); } catch(e) { data.body = event.data.text(); }
  }

  var options = {
    body: data.body,
    icon: '/icons/favicon-128x128.png',
    badge: '/icons/favicon-48x48.png',
    data: { reminderId: data.reminderId }
  };

  if (data.reminderId) {
    options.actions = [{ action: 'snooze', title: 'Отложить на 5 минут' }];
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(function() { return self.clients.matchAll({ type: 'window' }); })
      .then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'PUSH_RECEIVED', title: data.title, body: data.body, reminderId: data.reminderId });
        });
      })
  );
});

self.addEventListener('notificationclick', function(event) {
  var action = event.action;
  if (action === 'snooze') {
    var rid = event.notification.data.reminderId;
    event.waitUntil(
      fetch('/snooze?reminderId=' + rid, { method: 'POST' })
        .then(function() { event.notification.close(); })
        .catch(function(e) { console.error('Snooze failed:', e); })
    );
  } else {
    event.notification.close();
  }
});
