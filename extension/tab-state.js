// Per-tab link-check results and a per-URL cache, kept in
// chrome.storage.session rather than in background.js memory.
//
// Why (QA findings #22 and #23):
//   - #22: the MV3 background worker is stopped after ~30s idle, taking any
//     in-memory Map with it, so the popup said "Not checked yet" while the
//     badge was still red. storage.session survives the worker restarting
//     (and is cleared when the browser closes - nothing lands on disk).
//   - #23: every tab switch re-called /api/check-url, burning the 120/15min
//     limit. A result is now reused for the same URL for URL_CACHE_TTL_MS,
//     and concurrent checks of one URL share a single request.
// Failures are cached briefly too, so a rate limit or an outage isn't hit
// again on every tab switch - but short enough to recover on its own.

export const URL_CACHE_TTL_MS = 10 * 60 * 1000;
export const LIMITED_TTL_MS = 60 * 1000;
export const FAILURE_TTL_MS = 15 * 1000;
const MAX_CACHED_URLS = 200;
const URL_CACHE_KEY = "fraudlens.urlCache.v1";
const tabKey = (tabId) => `fraudlens.tab.v1.${tabId}`;

export function isWebUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/** Cache key: the URL without its #fragment (never sent to a server anyway). */
export function cacheKeyFor(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function ttlFor(entry) {
  if (!entry.error) return URL_CACHE_TTL_MS;
  return entry.errorKind === "rate_limited" || entry.errorKind === "busy" ? LIMITED_TTL_MS : FAILURE_TTL_MS;
}

/**
 * @param {{ storage: { get: Function, set: Function, remove: Function }, checkUrl: (url: string) => Promise<object>, now?: () => number }} deps
 */
export function createTabState({ storage, checkUrl, now = Date.now }) {
  const inFlight = new Map(); // cacheKey -> Promise<entry>

  async function readCache() {
    const { [URL_CACHE_KEY]: cache } = await storage.get(URL_CACHE_KEY);
    return cache && typeof cache === "object" ? cache : {};
  }

  async function writeCache(key, entry) {
    const cache = await readCache();
    cache[key] = entry;
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHED_URLS) {
      keys.sort((a, b) => cache[a].at - cache[b].at);
      for (const k of keys.slice(0, keys.length - MAX_CACHED_URLS)) delete cache[k];
    }
    await storage.set({ [URL_CACHE_KEY]: cache });
  }

  const fresh = (entry) => entry && now() - entry.at < ttlFor(entry);

  async function fetchEntry(url, key) {
    const hostname = hostnameOf(url);
    try {
      const data = await checkUrl(url);
      // Our fields last: the response's own `url` must not replace the cache key.
      return { ...data, url: key, hostname, at: now() };
    } catch (err) {
      // Fail open: never blocks browsing, never implies a verdict.
      return { url: key, hostname, at: now(), error: err?.message ?? String(err), errorKind: err?.kind ?? "unreachable" };
    }
  }

  /** The stored result for a tab, or null. */
  async function getTab(tabId) {
    const { [tabKey(tabId)]: entry } = await storage.get(tabKey(tabId));
    return entry ?? null;
  }

  /**
   * Returns the tab's result for `url`, calling the backend only when no
   * fresh result exists for that URL (in this tab or any other).
   * @returns {Promise<{ entry: object|null, fromCache: boolean }>}
   */
  async function ensureChecked(tabId, url) {
    if (!isWebUrl(url)) {
      await storage.remove(tabKey(tabId));
      return { entry: null, fromCache: false };
    }
    const key = cacheKeyFor(url);

    const current = await getTab(tabId);
    if (current?.url === key && fresh(current)) return { entry: current, fromCache: true };

    const cached = (await readCache())[key];
    if (fresh(cached)) {
      await storage.set({ [tabKey(tabId)]: cached });
      return { entry: cached, fromCache: true };
    }

    if (!inFlight.has(key)) {
      inFlight.set(
        key,
        fetchEntry(url, key)
          .then(async (entry) => {
            await writeCache(key, entry);
            return entry;
          })
          .finally(() => inFlight.delete(key))
      );
    }
    const entry = await inFlight.get(key);
    await storage.set({ [tabKey(tabId)]: entry });
    return { entry, fromCache: false };
  }

  async function removeTab(tabId) {
    await storage.remove(tabKey(tabId));
  }

  return { getTab, ensureChecked, removeTab };
}
