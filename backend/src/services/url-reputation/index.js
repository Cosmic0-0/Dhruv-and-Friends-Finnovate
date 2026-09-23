// Assessment of ONE URL - the page the browser extension is on - for
// POST /api/check-url (the toolbar badge). Non-LLM and deterministic apart
// from two best-effort lookups (domain age, cached), so it stays fast enough
// to run on every navigation.
//
// This is not message analysis, and it is tuned for that:
//   - Brand-in-PATH (URL-03 with location "path") is amber, not red: on the
//     page you're already on, /mcb/ in the path is weaker evidence than in a
//     link someone sent you. Brand in the subdomain stays red. Trusted big
//     sites never get URL-03 at all (en.wikipedia.org/wiki/MCB_Group).
//   - URL-08 ("verify via unofficial link") is left out: the URL itself
//     containing "login" says nothing about who is asking.
//   - Signals that need no message: shortener (URL-05), raw IP (URL-06),
//     "@" disguise (URL-07), known-phishing lists (REP-05), a domain
//     registered days ago (URL-09), and repeated user reports (REP-03).
//
// Positive facts are returned too, so the popup can say "this is MCB's
// official website" instead of just "no risk found".

import { checkUrls, checkLinkHygiene, isTrustedDomain, splitHost } from "../domain-matching/index.js";
import { institutionForHost, normalizeHost } from "../institutions/index.js";
import { getDomainAgeDays } from "../domain-age/index.js";
import { checkUrlAgainstThreatIntel } from "../threat-intel/index.js";
import { makeSignal } from "../signals/registry.js";
import { getReportCount } from "../../db/index.js";

export const URL_REPUTATION_VERSION = "url-rep-1.0";

// Phishing domains are typically used within days of registration; most
// legitimate sites people bank or shop on are years old.
export const NEW_DOMAIN_DAYS = 30;
// Same threshold the message pipeline uses for a reported sender (REP-03).
export const REPORT_THRESHOLD = 3;
const HYGIENE_CODES = new Set(["URL-05", "URL-06", "URL-07"]);
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function parse(url) {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`);
    return { href: u.href, host: normalizeHost(u.hostname) };
  } catch {
    return null;
  }
}

/** eTLD+1 in ASCII (punycode) form, as RDAP expects - or null for IPs/single labels. */
function registrable(host) {
  if (!host || IPV4_RE.test(host) || host.includes(":") || !host.includes(".")) return null;
  const { registrable: label, suffix } = splitHost(host);
  return label && suffix && label !== suffix ? `${label}.${suffix}` : null;
}

function relaxForBrowsing(signal) {
  // Brand only in the path of an unknown site: suspicious, not definitive.
  if (signal.code === "URL-03" && signal.metadata?.location === "path") return { ...signal, severity: "medium" };
  return signal;
}

async function domainAgeSignal(host, lookup) {
  const domain = registrable(host);
  if (!domain) return { ageDays: null, signal: null };
  const ageDays = await lookup(domain);
  if (typeof ageDays !== "number") return { ageDays: null, signal: null };
  if (ageDays >= NEW_DOMAIN_DAYS) return { ageDays, signal: null };
  return {
    ageDays,
    signal: makeSignal("URL-09", {
      sourceType: "rule",
      evidence: domain,
      severity: ageDays < 7 ? "high" : "medium",
      description: `${domain} was registered ${ageDays === 0 ? "today" : `${ageDays} day${ageDays === 1 ? "" : "s"} ago`}. Scam sites are usually brand new; established banks and shops are years old.`,
      metadata: { host, domain, ageDays },
      extra: { domain },
    }),
  };
}

function reportSignal(host, count) {
  return makeSignal("REP-03", {
    sourceType: "community",
    evidence: host,
    description: `FraudLens users have reported this site ${count} times.`,
    metadata: { host, reports: count },
  });
}

/**
 * @param {string} url
 * @param {{ domainAge?: (domain: string) => Promise<number|undefined> }} [deps] injectable for tests
 * @returns {Promise<{ url: string, host: string|null, flagged: boolean, signals: object[], reportCount: number,
 *   officialInstitution: string|null, trusted: boolean, domainAgeDays: number|null, version: string }>}
 */
export async function assessUrl(url, { domainAge = getDomainAgeDays } = {}) {
  const parsed = parse(url);
  const host = parsed?.host ?? null;
  const official = host ? institutionForHost(host) : null;
  const trusted = host ? isTrustedDomain(host) : false;

  const signals = [
    ...checkUrls(url).map(relaxForBrowsing),
    ...checkLinkHygiene(url).filter((s) => HYGIENE_CODES.has(s.code)),
    ...(parsed ? checkUrlAgainstThreatIntel(parsed.href) : []),
  ];

  // Reputation and age never apply to an institution's own domain or a big
  // trusted site - those can't be "new", and reports against them are the
  // brand-poisoning case (people reporting the real bank because a scam
  // claimed to be it).
  let reportCount = 0;
  let domainAgeDays = null;
  if (host && !official && !trusted) {
    reportCount = getReportCount(host);
    if (reportCount >= REPORT_THRESHOLD) signals.push(reportSignal(host, reportCount));
    const age = await domainAgeSignal(host, domainAge).catch(() => ({ ageDays: null, signal: null }));
    domainAgeDays = age.ageDays;
    if (age.signal) signals.push(age.signal);
  }

  return {
    url,
    host,
    flagged: signals.length > 0,
    signals,
    reportCount,
    officialInstitution: official?.display_name ?? null,
    trusted,
    domainAgeDays,
    version: URL_REPUTATION_VERSION,
  };
}
