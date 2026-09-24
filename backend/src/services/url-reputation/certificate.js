// The TLS certificate of a site the extension checks (POST /api/check-url),
// read on every check - the modern equivalent of the old browser "green
// bar": which organisation (if any) the certificate was issued to, and at
// what validation level (EV / OV / DV).
//
// One bare TLS handshake to port 443 through site-security's probeTls(),
// which runs the SSRF guard first; no HTTP request is sent. Fail-open: a
// timeout, refusal or a plain-HTTP-only site gives null facts and no signal.
// Cached per host for an hour so tab switching doesn't re-handshake.
//
//   CERT-01 (high)   expired / not yet valid / self-signed / doesn't cover the
//                    host / not trusted by the system's CA store.
//   CERT-02 (medium) certificate issued in the last few days on a host the
//                    lookalike rules already flagged. A new certificate alone
//                    is routine (Let's Encrypt renews every 60-90 days), so it
//                    never fires by itself.

import { probeTls } from "../site-security/tls.js";
import { makeSignal } from "../signals/registry.js";

export const CERT_TIMEOUT_MS = 2500;
export const NEW_CERT_DAYS = 7;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE = 2000;
const DAY_MS = 86_400_000;

const cache = new Map(); // host -> { at, facts }

export function _resetCertificateCache() {
  cache.clear();
}

// The server didn't send its intermediate certificate. Browsers fill the gap
// (AIA fetching, cached intermediates) and show the site normally; Node
// doesn't, so these alone must not be reported as "untrusted".
const INCOMPLETE_CHAIN_CODES = new Set(["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_GET_ISSUER_CERT"]);

function problemOf(result, now) {
  const from = Date.parse(result.validFrom);
  const to = Date.parse(result.validTo);
  if (Number.isFinite(to) && to < now) return "expired";
  if (Number.isFinite(from) && from > now) return "not_yet_valid";
  if (result.selfSigned) return "self_signed";
  if (result.coversHost === false) return "wrong_host";
  if (!result.authorized && !INCOMPLETE_CHAIN_CODES.has(result.authorizationCode)) return "untrusted";
  return null;
}

/**
 * @param {string} host
 * @param {{ probe?: typeof probeTls, now?: () => number }} [deps]
 * @returns {Promise<null | { validation: "EV"|"OV"|"DV"|null, organization: string|null, issuer: string|null,
 *   validFrom: string|null, validTo: string|null, issuedDaysAgo: number|null, expiresInDays: number|null,
 *   trusted: boolean, problem: string|null }>}
 */
export async function getCertificateFacts(host, { probe = probeTls, now = Date.now } = {}) {
  const hit = cache.get(host);
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.facts;
  let facts = null;
  try {
    const result = await probe(host, 443, { timeout: CERT_TIMEOUT_MS });
    if (result?.ok) {
      const t = now();
      const from = Date.parse(result.validFrom);
      const to = Date.parse(result.validTo);
      const problem = problemOf(result, t);
      facts = {
        validation: result.validation ?? null,
        organization: result.organization ?? null,
        issuer: result.issuer ?? null,
        validFrom: result.validFrom ?? null,
        validTo: result.validTo ?? null,
        issuedDaysAgo: Number.isFinite(from) ? Math.max(0, Math.floor((t - from) / DAY_MS)) : null,
        expiresInDays: Number.isFinite(to) ? Math.floor((to - t) / DAY_MS) : null,
        trusted: problem === null,
        problem,
      };
    }
  } catch {
    facts = null; // SSRF refusal or socket failure: no facts, never an error
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(host, { at: now(), facts });
  return facts;
}

const PROBLEM_TEXT = {
  expired: "has expired",
  not_yet_valid: "is not valid yet",
  self_signed: "is self-signed (not issued by any certificate authority)",
  wrong_host: "was issued for a different website",
  untrusted: "is not issued by a trusted certificate authority",
};

/** CERT-01 / CERT-02 for one host's facts. */
export function certificateSignals(host, facts, { isLookalike }) {
  if (!facts) return [];
  if (facts.problem) {
    return [
      makeSignal("CERT-01", {
        sourceType: "rule",
        evidence: host,
        description: `This site's security certificate ${PROBLEM_TEXT[facts.problem]}. Don't enter passwords or card details here.`,
        metadata: { host, problem: facts.problem, issuer: facts.issuer },
        extra: { domain: host },
      }),
    ];
  }
  if (isLookalike && typeof facts.issuedDaysAgo === "number" && facts.issuedDaysAgo < NEW_CERT_DAYS) {
    const when = facts.issuedDaysAgo === 0 ? "today" : `${facts.issuedDaysAgo} day${facts.issuedDaysAgo === 1 ? "" : "s"} ago`;
    return [
      makeSignal("CERT-02", {
        sourceType: "rule",
        evidence: host,
        description: `This look-alike site's certificate was issued ${when}. Phishing sites are usually set up just before they're used.`,
        metadata: { host, issuedDaysAgo: facts.issuedDaysAgo, issuer: facts.issuer },
        extra: { domain: host },
      }),
    ];
  }
  return [];
}
