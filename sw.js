var CACHE = 'cp-v7';
var ASSETS = ['/', '/signals.html', '/ta.html', '/login.html', '/shared.css', '/shared.js', '/manifest.json', '/api/all'];
self.addEventListener('install', function(e) { e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(ASSETS).catch(function(){}) })); self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(caches.keys().then(function(ks) { return Promise.all(ks.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)})) })); self.clients.claim(); });
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return;
  // Don't cache API calls or websocket
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/ws')) return;
  e.respondWith(fetch(e.request).then(function(r) { if (r.ok) { var c = r.clone(); caches.open(CACHE).then(function(ca) { ca.put(e.request, c) }); } return r; }).catch(function() { return caches.match(e.request); }));
});
