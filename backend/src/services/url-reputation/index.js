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
//   - A shortened link is resolved one hop (short-links.js) and its
//     destination gets the same lookalike / hygiene / threat-list checks,
//     tagged metadata.viaShortener. The destination itself is never fetched.
//   - The site's TLS certificate is read on every https check
//     (certificate.js): who it was issued to (EV/OV/DV), CERT-01 when it's
//     invalid, CERT-02 when a lookalike's certificate is days old. Tunnel and
//     dynamic-DNS hosts are URL-11.
//
// Positive facts are returned too, so the popup can say "this is MCB's
// official website" instead of just "no risk found".

import { checkUrls, checkLinkHygiene, isTrustedDomain, splitHost } from "../domain-matching/index.js";
import { institutionForHost, normalizeHost } from "../institutions/index.js";
import { getDomainAgeDays, getCertificateAgeDays } from "../domain-age/index.js";
import { checkUrlAgainstThreatIntel } from "../threat-intel/index.js";
import { lookupSafeBrowsing, safeBrowsingSignal } from "../threat-intel/safe-browsing.js";
import { makeSignal } from "../signals/registry.js";
import { getReportCount } from "../../db/index.js";
import { isShortLinkHost, resolveShortLink as defaultResolveShortLink } from "./short-links.js";
import { getCertificateFacts, certificateSignals } from "./certificate.js";

export const URL_REPUTATION_VERSION = "url-rep-1.2";

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

const pluralDays = (n) => (n === 0 ? "today" : `${n} day${n === 1 ? "" : "s"} ago`);

/**
 * URL-09 from Certificate Transparency when RDAP has no date. Weaker than a
 * registration date (it's when the site first had HTTPS), so it never goes
 * above medium and is worded as what it is.
 */
function certificateAgeSignal(host, domain, firstCertDays) {
  if (typeof firstCertDays !== "number" || firstCertDays >= NEW_DOMAIN_DAYS) return null;
  return makeSignal("URL-09", {
      sourceType: "rule",
      evidence: domain,
      severity: "medium",
      description: `${domain} first appeared in public certificate logs ${pluralDays(firstCertDays)} (its registration date could not be looked up). Scam sites are usually brand new.`,
      metadata: { host, domain, firstCertificateDays: firstCertDays, source: "certificate-transparency" },
      extra: { domain },
  });
}

/**
 * Registration age (RDAP) and first-certificate age (CT logs), both looked up
 * every time, in parallel. URL-09 uses the registration date when there is
 * one and falls back to the certificate history only when there isn't.
 */
async function domainAgeSignal(host, lookup, certAge) {
  const domain = registrable(host);
  if (!domain) return { ageDays: null, firstCertificateDays: null, signal: null };
  const [rdap, ct] = await Promise.all([lookup(domain).catch(() => undefined), certAge(domain).catch(() => undefined)]);
  const ageDays = typeof rdap === "number" ? rdap : null;
  const firstCertificateDays = typeof ct === "number" ? ct : null;
  if (ageDays === null) return { ageDays, firstCertificateDays, signal: certificateAgeSignal(host, domain, firstCertificateDays) };
  if (ageDays >= NEW_DOMAIN_DAYS) return { ageDays, firstCertificateDays, signal: null };
  return {
    ageDays,
    firstCertificateDays,
    signal: makeSignal("URL-09", {
      sourceType: "rule",
      evidence: domain,
      severity: ageDays < 7 ? "high" : "medium",
      description: `${domain} was registered ${pluralDays(ageDays)}. Scam sites are usually brand new; established banks and shops are years old.`,
      metadata: { host, domain, ageDays },
      extra: { domain },
    }),
  };
}

// Tunnels and dynamic-DNS services: they put a laptop or throwaway server on
// a public name in seconds, which phishing kits use constantly and banks,
// shops and government sites essentially never do. Matched as the host or a
// subdomain of it.
export const TUNNEL_HOSTS = Object.freeze([
  "ngrok.io", "ngrok-free.app", "ngrok.app", "ngrok-free.dev", "trycloudflare.com", "loca.lt", "localtunnel.me", "serveo.net",
  "localhost.run", "lhr.life", "pinggy.link", "duckdns.org", "ddns.net", "hopto.org", "zapto.org", "no-ip.org", "no-ip.biz",
  "sytes.net", "freeddns.org", "dynu.net", "000webhostapp.com",
]);
const LOOKALIKE_CODES = new Set(["URL-01", "URL-02", "URL-03", "URL-04"]);

function tunnelHostSignal(host) {
  const service = TUNNEL_HOSTS.find((d) => host === d || host.endsWith(`.${d}`));
  if (!service) return null;
  return makeSignal("URL-11", {
    sourceType: "rule",
    evidence: host,
    description: `This site runs on ${service}, a tunnel / dynamic-DNS service that gives any computer a temporary public address. Real banks and shops don't host their sites this way.`,
    metadata: { host, service },
    extra: { domain: host },
  });
}

function reportSignal(host, count) {
  return makeSignal("REP-03", {
    sourceType: "community",
    evidence: host,
    description: `FraudLens users have reported this site ${count} times.`,
    metadata: { host, reports: count },
  });
}

/** Lookalike, hygiene and threat-list signals for one URL. */
function staticSignals(url, href) {
  return [
    ...checkUrls(url).map(relaxForBrowsing),
    ...checkLinkHygiene(url).filter((s) => HYGIENE_CODES.has(s.code)),
    ...(href ? checkUrlAgainstThreatIntel(href) : []),
  ];
}

/** Signals for where a short link points, or none when it can't be resolved. */
async function destinationSignals(parsed, resolve) {
  const resolvedUrl = await resolve(parsed.href).catch(() => null);
  const destination = typeof resolvedUrl === "string" ? parse(resolvedUrl) : null;
  if (!destination || isShortLinkHost(destination.host)) return { resolvedUrl: destination?.href ?? null, signals: [] };
  const signals = staticSignals(destination.href, destination.href).map((s) => ({
    ...s,
    metadata: { ...s.metadata, viaShortener: parsed.host },
  }));
  return { resolvedUrl: destination.href, signals };
}

/**
 * @param {string} url
 * @param {{ domainAge?: (domain: string) => Promise<number|undefined>,
 *   resolveShortLink?: (url: string) => Promise<string|null> }} [deps] injectable for tests
 * @returns {Promise<{ url: string, host: string|null, flagged: boolean, signals: object[], reportCount: number,
 *   officialInstitution: string|null, trusted: boolean, domainAgeDays: number|null, resolvedUrl: string|null, version: string }>}
 */
export async function assessUrl(
  url,
  {
    domainAge = getDomainAgeDays,
    certAge = getCertificateAgeDays,
    certificate = getCertificateFacts,
    resolveShortLink = defaultResolveShortLink,
    safeBrowsing = lookupSafeBrowsing,
  } = {}
) {
  const parsed = parse(url);
  const host = parsed?.host ?? null;
  const official = host ? institutionForHost(host) : null;
  const trusted = host ? isTrustedDomain(host) : false;

  const signals = staticSignals(url, parsed?.href);
  let resolvedUrl = null;
  if (parsed && isShortLinkHost(host)) {
    const destination = await destinationSignals(parsed, resolveShortLink);
    resolvedUrl = destination.resolvedUrl;
    signals.push(...destination.signals);
  }

  // Reputation and age never apply to an institution's own domain or a big
  // trusted site - those can't be "new", and reports against them are the
  // brand-poisoning case (people reporting the real bank because a scam
  // claimed to be it).
  const tunnel = host ? tunnelHostSignal(host) : null;
  if (tunnel) signals.push(tunnel);

  // The certificate is read for EVERY https page, official ones included:
  // it's where the positive "issued to <organisation>" fact comes from, and
  // an invalid certificate on a real bank's site is still worth saying.
  const certificatePromise = parsed?.href.startsWith("https:") ? certificate(host).catch(() => null) : Promise.resolve(null);

  let reportCount = 0;
  let domainAgeDays = null;
  let firstCertificateDays = null;
  if (host && !official && !trusted) {
    reportCount = getReportCount(host);
    if (reportCount >= REPORT_THRESHOLD) signals.push(reportSignal(host, reportCount));
    const [age, threat] = await Promise.all([
      domainAgeSignal(host, domainAge, certAge).catch(() => ({ ageDays: null, firstCertificateDays: null, signal: null })),
      // Google Safe Browsing only when the local lists haven't already matched.
      signals.some((s) => s.code === "REP-05") ? null : safeBrowsing(parsed.href).catch(() => null),
    ]);
    domainAgeDays = age.ageDays;
    firstCertificateDays = age.firstCertificateDays;
    if (age.signal) signals.push(age.signal);
    if (threat) signals.push(safeBrowsingSignal(parsed.href, host, threat));
  }

  const certificateFacts = await certificatePromise;
  signals.push(...certificateSignals(host, certificateFacts, { isLookalike: signals.some((s) => LOOKALIKE_CODES.has(s.code)) }));

  return {
    url,
    host,
    flagged: signals.length > 0,
    signals,
    reportCount,
    officialInstitution: official?.display_name ?? null,
    trusted,
    domainAgeDays,
    firstCertificateDays,
    certificate: certificateFacts,
    resolvedUrl,
    version: URL_REPUTATION_VERSION,
  };
}
