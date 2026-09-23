/*
 * FraudLens service worker: caches the app shell so the app opens offline.
 *
 * - Navigations: network-first; every successful page is cached by path, and
 *   offline falls back to that page, then to the shell ("/app", the web app;
 *   "/" is the landing page).
 * - Same-origin build assets (/_next/static, /icons): cache-first (they're
 *   content-hashed or versioned, so a cached copy is always correct).
 * - Everything else goes straight to the network and is never cached. API
 *   calls are same-origin POSTs to /api/* (proxied to the backend) and are
 *   skipped below because only GETs are handled. Verdicts must be live.
 *
 * /learn is precached: the Learn tab needs no backend, so it's the screen
 * that still works when the LLM or the network is down during the demo.
 *
 * Bump CACHE_VERSION when the precache list changes.
 */
const CACHE_VERSION = "v3";
const CACHE_NAME = `fraudlens-shell-${CACHE_VERSION}`;
const SHELL_URL = "/app";
const PRECACHE = [
  "/",
  SHELL_URL,
  "/learn",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("fraudlens-shell-") && k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const key = url.pathname; // ignore query strings for page caching
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(key, copy));
          }
          return response;
        })
        .catch(() => caches.match(key).then((hit) => hit || caches.match(SHELL_URL))),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
