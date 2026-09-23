// SSRF guard for the site-security scanner (services/site-security). The
// URL this module validates ultimately comes from the browser extension's
// current-tab URL, but /api/analyze-site is a public POST route, so it must
// be treated as fully attacker-controlled input — anyone can submit any
// string. This is the only thing standing between that input and this
// server making outbound requests on its behalf.
//
// `_internals.lookup` is a deliberate mutable seam (see index.test.js) so
// tests can substitute a fake resolver instead of hitting real DNS — the
// same reason services/domain-age's tests substitute globalThis.fetch
// rather than calling the real RDAP service.

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const _internals = {
  lookup: (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
};

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inIpv4Range(ip, base, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

// Loopback, private, link-local, CGNAT, documentation/test-net, multicast,
// and reserved ranges — anywhere an attacker-influenced hostname could
// resolve that would let this fetch reach internal infrastructure instead
// of the public site the user is actually looking at.
const IPV4_BLOCKED_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedIpv4(ip) {
  return IPV4_BLOCKED_RANGES.some(([base, bits]) => inIpv4Range(ip, base, bits));
}

function isBlockedIpv6(ip) {
  const norm = ip.toLowerCase();
  if (norm === "::1" || norm === "::") return true;
  if (norm.startsWith("fe80:") || norm.startsWith("fc") || norm.startsWith("fd")) return true; // link-local + unique-local
  if (norm.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 (::ffff:127.0.0.1) — check the embedded address too.
    const embedded = norm.slice(7);
    if (isIP(embedded) === 4) return isBlockedIpv4(embedded);
  }
  return false;
}

/** True if `ip` is a private/loopback/link-local/reserved address, or not a recognizable IP at all (fail closed). */
export function isBlockedAddress(ip) {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

/**
 * Parses and validates a URL for the site-security scanner: http(s) only,
 * and every resolved address for its hostname must be public. Resolves DNS
 * itself (rather than trusting fetch to) so this check actually runs before
 * any request is made, and must be re-run on every redirect hop by the
 * caller (see fetcher.js) — a public hostname's first response can still
 * redirect somewhere internal.
 */
export async function assertPublicHttpUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new UnsafeUrlError("url is not a valid URL");
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafeUrlError("url must use http or https");
  }
  if (!parsed.hostname || parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError("url host is not a public hostname");
  }

  const directIpVersion = isIP(parsed.hostname);
  let addresses;
  if (directIpVersion) {
    addresses = [parsed.hostname];
  } else {
    try {
      addresses = (await _internals.lookup(parsed.hostname)).map((a) => a.address);
    } catch {
      addresses = [];
    }
  }

  if (addresses.length === 0) throw new UnsafeUrlError("url host could not be resolved");
  if (addresses.some(isBlockedAddress)) throw new UnsafeUrlError("url resolves to a private or reserved address");

  return parsed;
}
