// UNBEATEN: 50-0 — Service Worker
// Caches static game assets only.
// All cross-origin requests (Firebase, Google APIs, fonts) are passed through untouched.

const CACHE_NAME = 'unbeaten-50-0-v2';

// Files to pre-cache immediately on install
const PRECACHE_URLS = [
  './index.html',
  './manifest.json'
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(PRECACHE_URLS); })
      .catch(function(err) { console.warn('[SW] Pre-cache failed (non-fatal):', err); })
      .then(function() { return self.skipWaiting(); })
  );
});

// ── Activate — delete old caches ─────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_NAME; })
          .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  // !! KEY SAFETY RULE !!
  // Skip ALL cross-origin requests. This automatically excludes:
  //   Firebase SDK     (www.gstatic.com)
  //   Firebase Auth    (identitytoolkit.googleapis.com)
  //   Firestore        (firestore.googleapis.com)
  //   Cloud saves      (firebaseio.com / firestore.googleapis.com)
  //   Leaderboards     (firestore.googleapis.com)
  //   Google Fonts     (fonts.googleapis.com / fonts.gstatic.com)
  // None of these will ever be cached or interfered with.
  var reqOrigin;
  try { reqOrigin = new URL(req.url).origin; } catch(e) { return; }
  if (reqOrigin !== self.location.origin) return;

  var path = new URL(req.url).pathname;

  // ── Strategy 1: Cache-first for static game assets ──
  // Card images, backgrounds, frames, characters, auras, etc.
  // These change rarely; serve from cache for speed, update in background.
  if (path.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        if (cached) return cached;
        return fetch(req).then(function(res) {
          if (res && res.status === 200) {
            var clone = res.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
          }
          return res;
        }).catch(function() {
          return cached; // Return stale if network fails
        });
      })
    );
    return;
  }

  // ── Strategy 2: Network-first for HTML + manifest ──
  // Always try the network so players get game updates immediately.
  // Fall back to cache only if offline.
  if (path.endsWith('.html') || path.endsWith('.json') ||
      path.endsWith('/') || path === '') {
    event.respondWith(
      fetch(req).then(function(res) {
        if (res && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
        }
        return res;
      }).catch(function() {
        return caches.match(req);
      })
    );
    return;
  }

  // ── Strategy 3: Network with cache fallback for everything else ──
  event.respondWith(
    fetch(req).catch(function() { return caches.match(req); })
  );
});
