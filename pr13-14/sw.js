const CACHE_NAME = 'notes-cache-v2';
const DYNAMIC_CACHE_NAME = 'dynamic-content-v1';

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

let pushEnabled = true;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_PUSH_ENABLED') {
    pushEnabled = event.data.value;
    console.log('[SW] pushEnabled =', pushEnabled);
  }
});

self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/content/')) {
    event.respondWith(
      fetch(event.request)
        .then(networkRes => {
          const resClone = networkRes.clone();
          caches.open(DYNAMIC_CACHE_NAME).then(cache => {
            cache.put(event.request, resClone);
          });
          return networkRes;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cached => cached || caches.match('/content/home.html'));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        return fetch(event.request);
      })
      .catch(() => caches.match('/index.html'))
  );
});

// Push handler
self.addEventListener('push', (event) => {
  console.log('[SW] Push received, pushEnabled =', pushEnabled);

  if (!pushEnabled) {
    console.log('[SW] Push disabled, skipping');
    return;
  }

  let data = { title: 'Новое уведомление', body: '', reminderId: null };
  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: '/icons/favicon-128x128.png',
    badge: '/icons/favicon-48x48.png',
    data: { reminderId: data.reminderId }
  };

  if (data.reminderId) {
    options.actions = [
      { action: 'snooze', title: 'Отложить на 5 минут' }
    ];
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'PUSH_RECEIVED',
            title: data.title,
            body: data.body,
            reminderId: data.reminderId
          });
        });
      })
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;

  if (action === 'snooze') {
    const reminderId = notification.data.reminderId;
    event.waitUntil(
      fetch('/snooze?reminderId=' + reminderId, { method: 'POST' })
        .then(() => {
          console.log('[SW] Reminder snoozed');
          notification.close();
        })
        .catch(err => console.error('[SW] Snooze failed:', err))
    );
  } else {
    notification.close();
  }
});
