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

/*
 * Settings > "Scam alerts" / "Daily practice reminder": best-effort
 * background delivery. lib/notifications.ts's foreground poll is what
 * actually runs the demo; this only fires if the browser grants Periodic
 * Background Sync (Chromium, an installed PWA, site-engagement heuristics -
 * most browsers never grant it, which is why the Settings copy says "where
 * your browser allows it"). A service worker cannot read localStorage, so
 * both checks read/write the same Cache Storage mirror the page writes to
 * (see lib/notifications.ts MIRROR_CACHE) instead of duplicating state.
 */
const NOTIFY_CACHE = "fraudlens-notify-v1";
const CAMPAIGNS_SEEN_KEY = "/__notify/campaigns-seen";
const PRACTICE_STATUS_KEY = "/__notify/practice-status";
const GROWTH_THRESHOLD = 3;
const EVENING_HOUR = 18;

async function readMirror(key) {
  const cache = await caches.open(NOTIFY_CACHE);
  const hit = await cache.match(key);
  return hit ? hit.json() : null;
}

async function writeMirror(key, value) {
  const cache = await caches.open(NOTIFY_CACHE);
  await cache.put(key, new Response(JSON.stringify(value)));
}

async function backgroundScamAlertsCheck() {
  const res = await fetch("/api/trends");
  if (!res.ok) return;
  const data = await res.json();
  const seen = (await readMirror(CAMPAIGNS_SEEN_KEY)) || {};
  const firstRun = Object.keys(seen).length === 0;
  let alerted = false;
  for (const c of data.topCampaigns || []) {
    const prev = seen[c.fingerprintId];
    const grew = prev !== undefined && c.messageCount - prev >= GROWTH_THRESHOLD;
    if (!firstRun && (prev === undefined || grew) && !alerted) {
      const name = c.claimedIdentity || String(c.scamType).replace(/_/g, " ");
      await self.registration.showNotification(`New scam spreading: ${name}`, {
        body: `Seen in ${c.messageCount} checks on FraudLens. Open Radar to see what it looks like.`,
        tag: `scam-alert-${c.fingerprintId}`,
        icon: "/icons/icon-192.png",
        data: { url: "/trends" },
      });
      alerted = true;
    }
    seen[c.fingerprintId] = c.messageCount;
  }
  await writeMirror(CAMPAIGNS_SEEN_KEY, seen);
}

async function backgroundPracticeReminderCheck() {
  const status = await readMirror(PRACTICE_STATUS_KEY);
  if (!status || !status.on) return;
  const hour = new Date().getHours();
  const done = status.answered >= status.goal;
  if (done || status.lastShown === status.day || hour < EVENING_HOUR) return;
  await self.registration.showNotification("Five minutes of practice?", {
    body: "Today's Learn messages are waiting. Keep your streak going.",
    tag: "practice-reminder",
    icon: "/icons/icon-192.png",
    data: { url: "/learn" },
  });
  await writeMirror(PRACTICE_STATUS_KEY, { ...status, lastShown: status.day });
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "fraudlens-scam-alerts") event.waitUntil(backgroundScamAlertsCheck().catch(() => {}));
  if (event.tag === "fraudlens-practice-reminder") event.waitUntil(backgroundPracticeReminderCheck().catch(() => {}));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
