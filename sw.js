/* Wiedervorlage – Service Worker
 * Cacht ausschließlich die App-Dateien (keine Aufgabendaten, keine API-Antworten).
 * Neue Versionen werden erst nach Bestätigung in der App aktiviert.
 */
'use strict';
var VERSION = '0.4.0';
var CACHE = 'wv-app-' + VERSION;
var FILES = ['./', 'index.html', 'app.js', 'config.js', 'styles.css', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('wv-app-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    var scopePath = new URL(self.registration.scope).pathname;
    if (url.pathname === scopePath || url.pathname === scopePath + 'index.html') {
      e.respondWith(caches.match('index.html', { cacheName: CACHE }).then(function (r) { return r || fetch(req); }));
    }
    return; // andere Seiten (z. B. Verbindungstest) direkt aus dem Netz
  }
  e.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then(function (r) { return r || fetch(req); }));
});
