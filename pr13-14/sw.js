var CACHE_NAME = "softshop-shell-v3";
var DYNAMIC_CACHE = "softshop-dynamic-v1";
var ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.json",
  "/icons/favicon.ico",
  "/icons/favicon-16x16.png",
  "/icons/favicon-32x32.png",
  "/icons/favicon-48x48.png",
  "/icons/favicon-64x64.png",
  "/icons/favicon-128x128.png",
  "/icons/favicon-192x192.png",
  "/icons/favicon-256x256.png",
  "/icons/favicon-512x512.png"
];

// Install: pre-cache App Shell
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          return k !== CACHE_NAME && k !== DYNAMIC_CACHE;
        }).map(function (k) {
          return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Fetch: Cache First for shell, Network First for /content/*
self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // Skip cross-origin requests (CDN, socket.io, etc.)
  if (url.origin !== location.origin) return;

  // Dynamic content pages: Network First
  if (url.pathname.indexOf("/content/") === 0) {
    event.respondWith(
      fetch(event.request).then(function (networkRes) {
        var clone = networkRes.clone();
        caches.open(DYNAMIC_CACHE).then(function (cache) {
          cache.put(event.request, clone);
        });
        return networkRes;
      }).catch(function () {
        return caches.match(event.request).then(function (cached) {
          return cached || caches.match("/content/home.html");
        });
      })
    );
    return;
  }

  // App Shell: Cache First
  event.respondWith(
    caches.match(event.request).then(function (resp) {
      return resp || fetch(event.request);
    })
  );
});

// Push notification handler
self.addEventListener("push", function (event) {
  var data = { title: "SoftShop", body: "" };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data.body = event.data.text(); }
  }
  var options = {
    body: data.body,
    icon: "/icons/favicon-128x128.png",
    badge: "/icons/favicon-48x48.png"
  };
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});
