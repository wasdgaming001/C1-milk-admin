/* ============================================================================
 * MILK DELIVERY ADMIN — V19
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
 * on first load and served offline on subsequent visits.
 *
 * Fix #12 (the real offline fix): the install precache used to list only the
 * stable-URL shell files (/app.js, /app.css, …) and NEVER the React bundle
 * /assets/index-[hash].js. Those filenames are content-hashed and rotate
 * every build, so they can't be hardcoded. Instead, discoverAssets() fetches
 * the live /index.html at install time, scrapes every <script src> and
 * <link href> it references (the hashed JS/CSS/manifest + modulepreloads),
 * and precaches them together with the shell. Without this, an offline
 * revisit loaded /app.js + /app.css but missed the React bundle → blank app.
 *
 * Bump CACHE to milk-v20 whenever shell or strategy changes so activate()
 * evicts the old cache on the next visit.
 * ============================================================================ */

const CACHE = 'milk-v19'; // bumped: precache hashed Vite bundles at install (Fix #12)
const SHELL = [
  '/',
  '/index.html',
  '/app.js',
  '/app.css',
  '/favicon.svg',
  '/icons.svg',
  '/apple-touch-icon.png',
  '/icon-512.png',
];

// ── discoverAssets: read hashed bundle URLs from the live index.html ──────────
// Vite emits content-hashed filenames (e.g. /assets/index-Abc123.js) that we
// can't know at author-time. Parse the served /index.html instead and precache
// every script/stylesheet/manifest/modulepreload it points at. Keeps us in
// sync with hash rotation and manualChunks splits automatically.
async function discoverAssets() {
  const urls = new Set();
  try {
    const res = await fetch('/index.html', { cache: 'no-store' });
    if (!res.ok) return [];
    const html = await res.text();

    // <script src="…"> — the React entry + any modulepreloaded chunks
    for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
      urls.add(m[1]);
    }
    // <link href="…"> — stylesheets, manifest, modulepreload, icons
    for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) {
      urls.add(m[1]);
    }
  } catch (err) {
    // Network failed during install (unlikely — install only runs online).
    // Fall back to SHELL only; runtime /assets/ caching still backstops us.
    console.warn('[SW] discoverAssets failed, precaching SHELL only:', err.message);
    return [];
  }

  // Normalise to same-origin pathnames and drop anything odd.
  const origin = self.location.origin;
  return [...urls]
    .map(u => {
      try { return new URL(u, origin); } catch { return null; }
    })
    .filter(u => u && u.origin === origin)
    .map(u => u.pathname);
}

// ── Install: pre-cache shell + hashed bundles ────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const discovered = await discoverAssets();
    const toCache = [...SHELL, ...discovered];
    await Promise.all(
      toCache.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(err =>
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
  // (Fix #12 also precaches these at install, so offline revisits hit cache.)
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
