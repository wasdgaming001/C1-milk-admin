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

const CACHE = "milk-v20";
const SHELL = [
  "/",
  "/index.html",
  "/app.css",
  "/favicon.svg",
  "/icons.svg",
  "/apple-touch-icon.png",
  "/icon-512.png",
];

// ── discoverAssets: read hashed bundle URLs from the live index.html ──────────
// Vite emits content-hashed filenames (e.g. /assets/index-Abc123.js) that we
// can't know at author-time. Parse the served /index.html instead and precache
// every script/stylesheet/manifest/modulepreload it points at. Keeps us in
// sync with hash rotation and manualChunks splits automatically.
function _extractScriptUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    urls.add(m[1]);
  }
  return urls;
}

function _extractLinkUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) {
    urls.add(m[1]);
  }
  return urls;
}

function _normalizeUrls(urls, origin) {
  return [...urls]
    .map((u) => {
      try {
        return new URL(u, origin);
      } catch {
        return null;
      }
    })
    .filter((u) => u && u.origin === origin)
    .map((u) => u.pathname);
}

async function discoverAssets() {
  const urls = new Set();
  try {
    const res = await fetch("/index.html", { cache: "no-store" });
    if (!res.ok) return [];
    const html = await res.text();

    _extractScriptUrls(html).forEach((u) => urls.add(u));
    _extractLinkUrls(html).forEach((u) => urls.add(u));
  } catch (err) {
    // Network failed during install (unlikely — install only runs online).
    // Fall back to SHELL only; runtime /assets/ caching still backstops us.
    console.warn(
      "[SW] discoverAssets failed, precaching SHELL only:",
      err.message,
    );
    return [];
  }

  return _normalizeUrls(urls, self.location.origin);
}

// ── Install: pre-cache shell + hashed bundles ────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const discovered = await discoverAssets();
      const toCache = [...SHELL, ...discovered];
      await Promise.all(
        toCache.map((url) =>
          cache
            .add(new Request(url, { cache: "reload" }))
            .catch((err) =>
              console.warn("[SW] Cache install skipped:", url, err.message),
            ),
        ),
      );
      self.skipWaiting();
    })(),
  );
});

// ── Activate: evict old caches ────────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("milk-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────
function _isApiCall(url) {
  const path = new URL(url).pathname;
  return path.startsWith("/api");
}

async function _fetchAndCache(request) {
  const fresh = await fetch(request);
  if (fresh.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, fresh.clone());
  }
  return fresh;
}

async function _cacheMatchOrError(request) {
  const cached = await caches.match(request);
  return cached || new Response("", { status: 503 });
}

async function _handleAssetRequest(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await _fetchAndCache(request);
  } catch {
    return await _cacheMatchOrError(request);
  }
}

function _getOfflineFallback(request) {
  if (request.mode === "navigate") {
    return new Response("<h1>Offline</h1><p>Reconnect and refresh.</p>", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
  return new Response("", { status: 503 });
}

async function _handleShellRequest(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await _fetchAndCache(request);
  } catch {
    const fallback = await caches.match("/index.html");
    return fallback || _getOfflineFallback(request);
  }
}

async function _handleNetworkFirstRequest(request) {
  try {
    return await _fetchAndCache(request);
  } catch {
    return await _cacheMatchOrError(request);
  }
}

// REFACTORED: Extracted the '||' logic into a helper to drop cyclomatic complexity
function _isShellUrl(path) {
  return path === "/" || SHELL.includes(path);
}

// Complexity is now 4 (Base 1 + 3 'if' statements)
function determineFetchStrategy(url) {
  if (_isApiCall(url)) return "pass-through";
  if (url.pathname.startsWith("/assets/")) return "asset";
  if (_isShellUrl(url.pathname)) return "shell";
  return "network-first";
}

// Map strategies directly to handler functions to eliminate the switch statement
const STRATEGY_HANDLERS = {
  asset: _handleAssetRequest,
  shell: _handleShellRequest,
  "network-first": _handleNetworkFirstRequest,
};

// Complexity reduced by using a lookup map instead of a switch statement
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const strategy = determineFetchStrategy(url);
  const handler = STRATEGY_HANDLERS[strategy];

  // 'pass-through' is not in the map, so handler will be undefined, and we do nothing
  if (handler) {
    e.respondWith(handler(e.request));
  }
});

// ── Message: SKIP_WAITING (for update-on-refresh UX) ─────────────────────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
