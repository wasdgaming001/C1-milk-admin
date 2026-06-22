

/* ============================================================================
 * MILK DELIVERY ADMIN — V17
 * FILE 1: sw.js  (Service Worker — place in project root)
 * ============================================================================
 *
 * Cache strategy:
 *   - App shell (HTML/JS/CSS/icons) → Cache-first, updated on activate
 *   - /api calls → Network-only (never cached — always needs fresh data)
 *   - All other requests → Network-first, fall back to cache, then offline page
 *
 * Cache name must be bumped (milk-v18, milk-v19, …) whenever shell files
 * change so the activate handler evicts the old cache on the next visit.
 * ============================================================================ */

const CACHE = 'milk-v17';
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/app.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
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
    // Take control immediately without waiting for existing tabs to close
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
    // Claim all open tabs immediately
    await self.clients.claim();
  })());
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls: always network, never cache
  if (url.pathname.startsWith('/api') || url.pathname.includes('/.netlify/functions/')) {
    return; // let the browser handle it natively (no respondWith = pass-through)
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
        // For navigation requests, return the cached index.html as SPA fallback
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html') ||
            new Response('<h1>Offline</h1><p>Reconnect and refresh.</p>', {
              status: 503, headers: { 'Content-Type': 'text/html' }
            });
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


