/* ============================================================================
 * MILK DELIVERY ADMIN — V17
 * FILE 1: sw.js  (Service Worker — place in project root / public/)
 * ============================================================================
 *
 * Cache strategy:
 *   /assets/*    → Cache-first  (Vite content-hashed bundles — safe forever)
 *   Shell files  → Cache-first  (updated when CACHE name is bumped)
 *   /api calls   → Network-only (never cache — always needs fresh data)
 *   Everything else → Network-first with cache fallback
 *
 * Fix #10: added /assets/ branch so Vite's hashed JS/CSS bundles are cached
 * on first load and served offline on subsequent visits. Previously those
 * bundles fell through to "network-first", which meant the app broke offline.
 *
 * Bump CACHE to milk-v18 whenever shell or strategy changes so activate()
 * evicts the old cache on the next visit.
 * ============================================================================ */

const CACHE = 'milk-v18'; // bumped: /assets/ strategy added
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/app.css',
  '/manifest.json',
  '/favicon.svg',
  '/icons.svg',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(
      SHELL.map(url =>
        cache.add(url).catch(err =>
          console.warn('[SW] Cache install skipped:', url, err.message)
        )
      )
    );
    self.skipWaiting();
  })());
});

// ── Activate: evict old caches ────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('milk-') && k !== CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls: always network, never cache
  if (url.pathname.startsWith('/api') || url.pathname.includes('/.netlify/functions/')) {
    return; // pass-through — no respondWith()
  }

  // Fix #10 — Vite assets: cache-first.
  // Filenames are content-hashed (e.g. /assets/index-Abc123.js) so a given
  // URL is immutable. Cache on first fetch; serve from cache forever after.
  // This is what was missing: the app loaded over the network just fine, but
  // an offline revisit would fail because the JS bundle was never cached.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      try {
        const fresh = await fetch(e.request);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(e.request, fresh.clone());
        }
        return fresh;
      } catch {
        // Asset not cached yet and network is down — nothing we can serve
        return new Response('', { status: 503 });
      }
    })());
    return;
  }

  // Shell files: cache-first
  if (SHELL.includes(url.pathname) || url.pathname === '/') {
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      try {
        const fresh = await fetch(e.request);
        const cache = await caches.open(CACHE);
        cache.put(e.request, fresh.clone());
        return fresh;
      } catch {
        if (e.request.mode === 'navigate') {
          return (
            (await caches.match('/index.html')) ||
            new Response('<h1>Offline</h1><p>Reconnect and refresh.</p>', {
              status: 503, headers: { 'Content-Type': 'text/html' },
            })
          );
        }
        return new Response('', { status: 503 });
      }
    })());
    return;
  }

  // Everything else: network-first with cache fallback
  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(e.request, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(e.request);
      return cached || new Response('', { status: 503 });
    }
  })());
});

// ── Message: SKIP_WAITING (for update-on-refresh UX) ─────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
