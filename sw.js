// UNBEATEN: 50-0 — Service Worker
//
// Update-safe caching for GitHub Pages:
//   HTML + manifest → network-first with the HTTP cache BYPASSED
//                     (GH Pages serves max-age=600, which used to pin
//                     deploys for 10+ min), cache fallback when offline.
//   /assets/        → stale-while-revalidate: served instantly from
//                     cache, silently re-fetched so replaced files
//                     (same filename) update on the next load.
//   anything else same-origin → network, cache fallback.
//   ALL cross-origin (Firebase, Google fonts/APIs) → untouched.
//
// CACHE_NAME only needs bumping to force-flush old storage — regular
// content deploys are picked up automatically by the strategies above.

const CACHE_NAME = 'unbeaten-50-0-v9';

// Files to pre-cache immediately on install
const PRECACHE_URLS = [
  './index.html',
  './manifest.json'
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        // cache:'reload' bypasses the HTTP cache so the freshest deploy
        // is precached, not a stale intermediary copy.
        return Promise.all(PRECACHE_URLS.map(function(url) {
          return fetch(url, { cache: 'reload' })
            .then(function(res) {
              if (res && res.status === 200) return cache.put(url, res);
            })
            .catch(function() { /* non-fatal — cached on first fetch instead */ });
        }));
      })
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
  //   Google Fonts     (fonts.googleapis.com / fonts.gstatic.com)
  // None of these are ever cached or interfered with.
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  var path = url.pathname;
  var isDoc = req.mode === 'navigate' || path.endsWith('.html') ||
              path.endsWith('/') || path === '';
  var isManifest = path.endsWith('.json');

  // ── Strategy 1: Network-first, HTTP-cache bypassed, for HTML + manifest ──
  // cache:'no-cache' forces revalidation with GitHub Pages (cheap 304s via
  // ETag) instead of trusting the 10-minute HTTP cache — every deploy shows
  // up on the very next load. Falls back to the cached copy when offline.
  if (isDoc || isManifest) {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then(function(res) {
          if (res && res.status === 200) {
            var clone = res.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
          }
          return res;
        })
        .catch(function() {
          return caches.match(req).then(function(cached) {
            // Navigations offline: any URL form falls back to the app shell.
            return cached || (isDoc ? caches.match('./index.html') : undefined);
          });
        })
    );
    return;
  }

  // ── Strategy 2: Stale-while-revalidate for static game assets ──
  // Serve instantly from cache for speed, but ALWAYS refresh in the
  // background so re-exported art with the same filename updates on
  // the next visit instead of being pinned forever.
  if (path.includes('/assets/')) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        var network = fetch(req)
          .then(function(res) {
            if (res && res.status === 200) {
              var clone = res.clone();
              caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
            }
            return res;
          })
          .catch(function() { return cached; });
        return cached || network;
      })
    );
    return;
  }

  // ── Strategy 3: Network with cache fallback for everything else ──
  event.respondWith(
    fetch(req).catch(function() { return caches.match(req); })
  );
});
