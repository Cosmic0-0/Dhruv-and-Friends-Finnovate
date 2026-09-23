// Google Safe Browsing Lookup API (v4) for ONE URL - used by /api/check-url.
// Off unless SAFE_BROWSING_API_KEY is set: without a key this returns null
// and nothing else changes. Fail-open by design: a timeout, quota error or
// outage returns null (no signal), never an error for the caller, so the
// per-navigation check stays fast and available. Verdicts are cached per URL.

import { makeSignal } from "../signals/registry.js";

export const SAFE_BROWSING_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE = 2000;
const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const THREAT_LABEL = {
  MALWARE: "malware",
  SOCIAL_ENGINEERING: "phishing / deceptive",
  UNWANTED_SOFTWARE: "unwanted software",
  POTENTIALLY_HARMFUL_APPLICATION: "harmful app",
};

const cache = new Map(); // url -> { at, threat }

export function _resetSafeBrowsingCache() {
  cache.clear();
}

/**
 * @param {string} url absolute http(s) URL
 * @param {{ apiKey?: string, fetchImpl?: typeof fetch, now?: () => number }} [deps]
 * @returns {Promise<string|null>} the Safe Browsing threat type, or null (clean, disabled or unavailable)
 */
export async function lookupSafeBrowsing(url, { apiKey = process.env.SAFE_BROWSING_API_KEY, fetchImpl = fetch, now = Date.now } = {}) {
  if (!apiKey || !/^https?:\/\//i.test(url)) return null;
  const hit = cache.get(url);
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.threat;
  try {
    const res = await fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(SAFE_BROWSING_TIMEOUT_MS),
      body: JSON.stringify({
        client: { clientId: "fraudlens", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: Object.keys(THREAT_LABEL),
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }],
        },
      }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const threat = body?.matches?.[0]?.threatType ?? null;
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(url, { at: now(), threat });
    return threat;
  } catch {
    return null;
  }
}

/** REP-05 for a Safe Browsing match. */
export function safeBrowsingSignal(url, host, threat) {
  return makeSignal("REP-05", {
    sourceType: "intel",
    evidence: url,
    description: `Google Safe Browsing lists this link as ${THREAT_LABEL[threat] ?? "unsafe"}.`,
    metadata: { host, list: "google-safe-browsing", threatType: threat },
    extra: { domain: host },
  });
}
