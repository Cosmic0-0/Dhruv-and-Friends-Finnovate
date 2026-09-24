// Resolves a shortened link (bit.ly/...) to where it points, WITHOUT visiting
// the destination: one request to the shortener itself with redirect
// "manual", and the Location header is the answer.
//
// SSRF posture: only hosts on the fixed SHORTENER_HOSTS list are ever
// contacted (so user input can't choose the target host), always over HTTPS,
// and the address is still checked by the site-security SSRF guard before the
// request. The destination is returned as data and never fetched; a chain of
// shorteners is not followed past this one hop.

import { SHORTENER_HOSTS } from "../domain-matching/index.js";
import { normalizeHost } from "../institutions/index.js";
import { assertPublicHttpUrl } from "../site-security/url-safety.js";

export const SHORT_LINK_TIMEOUT_MS = 3000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isShortLinkHost(host) {
  return SHORTENER_HOSTS.includes(normalizeHost(host));
}

/**
 * @param {string} url a URL whose host is on SHORTENER_HOSTS
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 * @returns {Promise<string|null>} absolute http(s) destination, or null when it can't be read
 */
export async function resolveShortLink(url, { fetchImpl = fetch } = {}) {
  const parsed = new URL(url);
  if (!isShortLinkHost(parsed.hostname)) return null;
  const target = new URL(`https://${normalizeHost(parsed.hostname)}${parsed.pathname}${parsed.search}`);
  await assertPublicHttpUrl(target.href);

  const res = await fetchImpl(target.href, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(SHORT_LINK_TIMEOUT_MS),
    headers: { "user-agent": "FraudLens-LinkCheck/1.0" },
  });
  // The body is never read: only where the shortener says the link goes.
  await res.body?.cancel().catch(() => {});
  if (!REDIRECT_STATUSES.has(res.status)) return null;
  const location = res.headers.get("location");
  if (!location) return null;
  const destination = new URL(location, target);
  return destination.protocol === "https:" || destination.protocol === "http:" ? destination.href : null;
}
