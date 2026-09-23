// Single-visit HTTP fetch for the site-security scanner. "Single visit"
// means: one logical GET of a URL, following redirects manually (fetch's
// own redirect:"follow" would let a redirect chain skip the per-hop SSRF
// check) and capping how much body is read — this is the one place that
// talks to an arbitrary target site, so every other check in this service
// goes through it instead of calling fetch() directly.

import { assertPublicHttpUrl } from "./url-safety.js";

const DEFAULT_TIMEOUT_MS = Number(process.env.SITE_SECURITY_TIMEOUT_MS) || 6000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Identifies the scanner honestly rather than spoofing a browser UA — this
// is passive header/artifact inspection, not an attempt to look like real
// user traffic.
const USER_AGENT = "FraudLensSiteSecurity/1.0 (+passive security scan; no injected payloads)";

async function readBodyCapped(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    try {
      return { text: await response.text(), truncated: false };
    } catch {
      return { text: "", truncated: false };
    }
  }
  const chunks = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      truncated = true;
      reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8"), truncated };
}

/**
 * Fetches `urlString` once, following up to `maxRedirects` hops (each
 * re-validated by assertPublicHttpUrl), and returns
 * { finalUrl, status, headers, body, truncated, redirectChain, redirected }.
 * Throws UnsafeUrlError if the URL or any redirect target isn't a safe
 * public http(s) URL; throws a plain Error on network failure/timeout.
 */
export async function fetchOnce(urlString, options = {}) {
  const { method = "GET", maxRedirects = MAX_REDIRECTS, timeoutMs = DEFAULT_TIMEOUT_MS, readBody = true, maxBodyBytes = MAX_BODY_BYTES } = options;

  let current = await assertPublicHttpUrl(urlString);
  const chain = [current.href];
  let hop = 0;

  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(current.href, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT },
      });
    } finally {
      clearTimeout(timer);
    }

    const location = REDIRECT_STATUSES.has(response.status) ? response.headers.get("location") : null;
    if (location && hop < maxRedirects) {
      current = await assertPublicHttpUrl(new URL(location, current.href).href);
      chain.push(current.href);
      hop++;
      continue;
    }

    const { text, truncated } = readBody ? await readBodyCapped(response, maxBodyBytes) : { text: "", truncated: false };
    return {
      finalUrl: current.href,
      status: response.status,
      headers: response.headers,
      body: text,
      truncated,
      redirectChain: chain,
      redirected: chain.length > 1,
    };
  }
}
