// Non-LLM, deterministic — must stay unit-testable independent of the LLM call path.
//
// Institution data (official domains, brand tokens) lives in
// data/institution-registry.json via services/institutions; this module only
// parses links and compares them against it. Every official-domain check goes
// through isOfficialHost(), so a subdomain of an official domain
// (internet.mcb.mu) is always official - never a lookalike.

import {
  BRAND_DOMAIN_MAP,
  BRAND_TOKENS,
  INSTITUTIONS,
  OFFICIAL_DOMAINS,
  institutionForHost,
  institutionForToken,
  isOfficialHost,
  normalizeHost,
} from "../institutions/index.js";
import { domainToUnicode } from "node:url";
import { isTrustedDomain, TRUSTED_DOMAINS_VERSION } from "./trustedDomains.js";
import { makeSignal } from "../signals/registry.js";

export { BRAND_DOMAIN_MAP, BRAND_TOKENS, isOfficialHost, isTrustedDomain };
export const LEGIT_DOMAINS = OFFICIAL_DOMAINS;
// url-2.1: URL-08 (unofficial-link CTA) no longer fires for a host on the
// trusted-domains allowlist (data/trusted-domains.json) - see
// trustedDomains.js. URL-01..04 are unchanged: a trusted domain still gets
// zero impersonation/lookalike protection.
export const DETECTOR_VERSION = "url-2.1";

// Explicit-scheme URLs are parsed with URL() so the real host is used
// (https://mcb.mu@evil.top has host evil.top, not mcb.mu).
const SCHEME_URL_RE = /\bhttps?:\/\/[^\s<>"'()]+/gi;
// Scheme-less links: require a final all-alpha "TLD-like" label of 2-10
// chars so prose like "Rs.5000" / "e.g." doesn't match (FINDINGS.md #2).
const BARE_URL_RE = /(?<![@\w.-])(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,10}(?:\/[^\s<>"'()]*)?/gi;
// Hosts containing non-ASCII letters (homoglyph attacks) that the ASCII
// patterns above can't see at all.
const UNICODE_HOST_RE = /(?:https?:\/\/)?((?:[\p{L}\p{N}-]+\.)+\p{L}{2,10})(?:\/[^\s<>"'()]*)?/giu;
const IP_URL_RE = /\b(?:https?:\/\/)?((?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:\/[^\s<>"'()]*)?/g;

export const SHORTENER_HOSTS = Object.freeze([
  "bit.ly", "tinyurl.com", "t.ly", "cutt.ly", "is.gd", "rb.gy", "ow.ly", "t.co", "goo.gl", "shorturl.at", "tiny.cc", "s.id",
]);

// Public suffixes with two labels, so the registrable label of
// mra.gov.mu is "mra" and of shop.co.uk is "shop".
const MULTI_LABEL_SUFFIXES = new Set([
  "gov.mu", "com.mu", "org.mu", "net.mu", "ac.mu", "co.mu", "co.uk", "org.uk", "ac.uk", "gov.uk",
  "co.za", "com.au", "co.in", "com.br", "co.nz",
]);

// Small confusable map (Cyrillic/Greek letters that render like Latin) used
// only to compute a "skeleton" of a non-ASCII host for comparison.
const CONFUSABLES = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ј": "j", "ѕ": "s", "һ": "h", "ԁ": "d", "ӏ": "l",
  "α": "a", "ο": "o", "ρ": "p", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "τ": "t", "υ": "u",
};

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Edit distance allowed between a host's registrable label and an official
 * label, scaled by the official label's length. Short labels (mcb, mra, sbm)
 * allow 0: with 3 letters, distance 1-2 is "any other short word" (mra vs
 * mcb, FINDINGS.md #11). Exact brand labels on the wrong domain are caught
 * separately by the brand-token rule.
 */
export function maxEditDistance(labelLength) {
  if (labelLength <= 4) return 0;
  if (labelLength <= 8) return 1;
  return 2;
}

export function splitHost(host) {
  const labels = normalizeHost(host).split(".");
  const lastTwo = labels.slice(-2).join(".");
  const suffixLen = labels.length >= 3 && MULTI_LABEL_SUFFIXES.has(lastTwo) ? 2 : 1;
  const registrableIndex = labels.length - suffixLen - 1;
  return {
    labels,
    registrable: labels[registrableIndex] ?? labels[0],
    subdomains: labels.slice(0, Math.max(0, registrableIndex)),
    suffix: labels.slice(-suffixLen).join("."),
  };
}

function isShortener(host) {
  return SHORTENER_HOSTS.includes(normalizeHost(host));
}

/**
 * Every link in the text, with its real host, as { url, host, username,
 * path, span }. Explicit-scheme URLs are parsed first and masked out so the
 * bare-domain pass can't re-read their userinfo (mcb.mu@evil.top) as a host.
 */
export function extractLinks(message) {
  const links = [];
  let masked = message;
  for (const m of message.matchAll(SCHEME_URL_RE)) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    try {
      const parsed = new URL(url);
      links.push({
        url,
        host: normalizeHost(parsed.hostname),
        username: parsed.username,
        path: parsed.pathname,
        span: [m.index, m.index + url.length],
        hasScheme: true,
      });
    } catch {
      continue;
    }
    masked = masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }
  for (const m of masked.matchAll(BARE_URL_RE)) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    try {
      const parsed = new URL(`https://${url}`);
      links.push({ url, host: normalizeHost(parsed.hostname), username: "", path: parsed.pathname, span: [m.index, m.index + url.length], hasScheme: false });
    } catch {
      continue;
    }
  }
  return links.sort((a, b) => a.span[0] - b.span[0]);
}

/** Hostnames of every link, legit or not (reused by identity-consistency and community-signals). */
export function extractHostnames(message) {
  return extractLinks(message).map((l) => l.host);
}

function brandInLabels(labels) {
  for (const label of labels) {
    const parts = label.split("-");
    const token = BRAND_TOKENS.find((t) => parts.includes(t));
    if (token) return token;
  }
  return null;
}

function brandInPath(path) {
  const segments = path.toLowerCase().split(/[/\-_.?=&]+/).filter(Boolean);
  return BRAND_TOKENS.find((t) => segments.includes(t)) ?? null;
}

function closestOfficial(registrable) {
  for (const inst of INSTITUTIONS) {
    for (const domain of inst.official_domains) {
      const official = splitHost(domain).registrable;
      if (levenshtein(registrable, official) <= maxEditDistance(official.length)) return { inst, domain };
    }
  }
  return null;
}

function lookalikeSignal(code, link, { official, description, metadata = {} }) {
  return makeSignal(code, {
    sourceType: "rule",
    evidence: link.url,
    span: link.span,
    description,
    metadata: { host: link.host, officialDomain: official, institutionId: institutionForHost(official)?.id ?? null, ...metadata },
    extra: { domain: link.host, officialDomain: official },
  });
}

/** URL-01..URL-03 for one ASCII link, or null. Never fires for an official host. */
function classifyLink(link) {
  if (institutionForHost(link.host) || isShortener(link.host)) return null;
  const { registrable, subdomains } = splitHost(link.host);

  const registrableToken = brandInLabels([registrable]);
  if (registrableToken) {
    const official = BRAND_DOMAIN_MAP[registrableToken];
    return lookalikeSignal("URL-02", link, {
      official,
      description: `${link.host} contains brand token "${registrableToken}" but is not a recognized domain for it`,
      metadata: { brandToken: registrableToken },
    });
  }

  const close = closestOfficial(registrable);
  if (close) {
    return lookalikeSignal("URL-01", link, {
      official: close.domain,
      description: `${link.host} closely resembles legitimate domain ${close.domain}`,
    });
  }

  const subToken = brandInLabels(subdomains);
  const pathToken = subToken ? null : brandInPath(link.path);
  const token = subToken ?? pathToken;
  if (token) {
    const official = BRAND_DOMAIN_MAP[token];
    return lookalikeSignal("URL-03", link, {
      official,
      description: `${link.host} uses "${token}" in its ${subToken ? "subdomain" : "path"} but is not ${institutionForToken(token).display_name}'s domain`,
      metadata: { brandToken: token, location: subToken ? "subdomain" : "path" },
    });
  }
  return null;
}

export function skeleton(host) {
  return [...host.toLowerCase()].map((ch) => CONFUSABLES[ch] ?? ch).join("");
}

/** Lower-cased host in Unicode form (xn-- punycode labels decoded), "" when unparsable. */
export function unicodeHost(host) {
  const h = normalizeHost(host);
  if (!h) return "";
  const decoded = domainToUnicode(h);
  return decoded || h;
}

/** "finance.abc-supplies.example" -> "abc-supplies.example" (registrable label + public suffix). */
export function registrableDomain(host) {
  const { registrable, suffix } = splitHost(unicodeHost(host));
  return registrable && suffix && registrable !== suffix ? `${registrable}.${suffix}` : unicodeHost(host);
}

/**
 * Deterministic relation between two domains, used by the email detectors
 * (services/email-signals) to compare a sender domain with a trusted one:
 *   "same"      - identical, or a subdomain of the trusted domain
 *   "sibling"   - same registrable domain, different subdomain (mail.x vs pay.x)
 *   "lookalike" - different registrable domain whose label is visually or
 *                 edit-distance close to the trusted one (abc-suppiies vs
 *                 abc-supplies, Cyrillic/punycode skeleton match, or the same
 *                 label under a different public suffix)
 *   "different" - anything else
 * Uses the same edit-distance scaling and confusable skeleton as URL-01/URL-04.
 */
export function compareDomains(candidate, trusted) {
  const a = unicodeHost(candidate);
  const b = unicodeHost(trusted);
  if (!a || !b) return "different";
  if (isOfficialHost(a, b)) return "same";
  if (registrableDomain(a) === registrableDomain(b)) return "sibling";
  const technique = impersonationTechnique(a, b);
  return technique && technique !== "brand_embedded" ? "lookalike" : "different";
}

// Characters people misread for each other, folded to one representative
// on BOTH sides before comparing (asp1re / aspIre / aspire -> asplre).
const VISUAL_FOLDS = [
  [/rn/g, "m"], [/vv/g, "w"], [/cl/g, "d"],
  [/[il1|!]/g, "l"], [/[o0]/g, "o"], [/5/g, "s"], [/3/g, "e"], [/4/g, "a"], [/7/g, "t"], [/8/g, "b"], [/6/g, "g"],
];
function visualFold(label) {
  return VISUAL_FOLDS.reduce((s, [re, to]) => s.replace(re, to), skeleton(label));
}
const suffixLabelCount = (parts) => parts.suffix.split(".").length;

/**
 * How `candidate` imitates the trusted domain, or null when it does not (or
 * belongs to it). Deterministic; used for the organisation's own protected
 * domains (ORG-01/ORG-02) and for supplier domains (EMAIL-02/EMAIL-04):
 *   homoglyph        аspire.mu (Cyrillic а), xn--... decoded first
 *   label_split      a.spire.mu, a-spire.mu (labels / hyphen join to the brand)
 *   subdomain_abuse  aspire.mu.verify-login.com (brand as a label before an unrelated domain)
 *   tld_swap         aspire.co, aspire.com.mu-style (same label, other suffix)
 *   confusable       asp1re.mu, aspirne -> same after visual folding (1/l/i, 0/o, rn/m ...)
 *   typo             edit distance scaled by length (same scale as URL-01)
 *   brand_embedded   aspire-login.com, aspirepayroll.com (brand inside a longer label)
 * `brand_embedded` is the weakest - common words can be brands - so callers
 * decide whether it counts on its own.
 */
export function impersonationTechnique(candidate, trusted) {
  const a = unicodeHost(candidate);
  const b = unicodeHost(trusted);
  if (!a || !b || isOfficialHost(a, b) || registrableDomain(a) === registrableDomain(b)) return null;
  const A = splitHost(a);
  const B = splitHost(b);
  const brand = B.registrable;
  if (!brand) return null;

  if (/[^\x00-\x7f]/.test(a)) {
    const unicodeLabel = A.registrable.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    if (splitHost(skeleton(a)).registrable === brand || visualFold(unicodeLabel) === visualFold(brand)) return "homoglyph";
  }
  const beforeSuffix = A.labels.slice(0, A.labels.length - suffixLabelCount(A));
  if (beforeSuffix.length >= 2 && beforeSuffix.join("") === brand) return "label_split";
  if (A.registrable !== brand && A.registrable.replace(/-/g, "") === brand.replace(/-/g, "")) return "label_split";
  if (A.subdomains.includes(brand)) return "subdomain_abuse";
  if (A.registrable === brand) return "tld_swap";
  if (visualFold(A.registrable) === visualFold(brand)) return "confusable";
  if (brand.length >= 5 && levenshtein(A.registrable, brand) <= maxEditDistance(brand.length)) return "typo";
  if (brand.length >= 5 && (A.registrable.split("-").includes(brand) || A.registrable.includes(brand))) return "brand_embedded";
  return null;
}

/** URL-04: hosts written with non-ASCII look-alike letters, or punycode. */
function homoglyphSignals(message) {
  const out = [];
  for (const m of message.matchAll(UNICODE_HOST_RE)) {
    const host = m[1].toLowerCase();
    const isPunycode = host.split(".").some((l) => l.startsWith("xn--"));
    if (!/[^\x00-\x7f]/.test(host) && !isPunycode) continue;
    const skel = skeleton(host);
    const target = institutionForHost(skel) ?? institutionForToken(brandInLabels(splitHost(skel).labels));
    const official = target?.official_domains[0] ?? null;
    out.push(
      makeSignal("URL-04", {
        sourceType: "rule",
        evidence: m[0],
        span: [m.index, m.index + m[0].length],
        description: official
          ? `${host} uses look-alike characters to imitate ${official}`
          : `${host} uses non-standard or look-alike characters`,
        metadata: { host, skeleton: skel, officialDomain: official },
        extra: { domain: host, ...(official ? { officialDomain: official } : {}) },
      })
    );
  }
  return out;
}

/** Lookalike/brand-abuse signals (URL-01..URL-04), one per offending link. */
export function checkUrls(message) {
  const signals = [];
  for (const link of extractLinks(message)) {
    const s = classifyLink(link);
    if (s) signals.push(s);
  }
  return [...signals, ...homoglyphSignals(message)];
}

/** Hosts of checkUrls() signals, same order - zips domainAgeDays onto them. */
export function extractLookalikeHosts(message) {
  return checkUrls(message).map((s) => s.metadata.host);
}

// Phishing call-to-action: verify / log in / update / claim / pay "here".
// EN + FR + Kreol ("Klik lor", "verifye", "konfirm").
const LINK_CTA_RE =
  /\b(?:verify|confirm|log ?in|sign ?in|update|unlock|reactivate|restore|claim|click|tap|v[ée]rifiez|confirmez|connectez|cliquez|mettez à jour|verifye|konfirm|klik)\b/iu;

/** Weak/structural link signals: URL-05 shortener, URL-06 raw IP, URL-07 userinfo trick, URL-08 action via unofficial link. */
export function checkLinkHygiene(message) {
  const out = [];
  // "Unofficial" for URL-08 purposes only: not a recognized Mauritius
  // institution AND not on the trusted-domains allowlist (see
  // trustedDomains.js's doc comment - this is the ONLY signal that list
  // affects; a trusted domain still gets zero lookalike protection).
  const unofficial = extractLinks(message).filter((l) => !institutionForHost(l.host) && !isTrustedDomain(l.host));
  const cta = unofficial.length > 0 ? LINK_CTA_RE.exec(message) : null;
  if (cta) {
    out.push(
      makeSignal("URL-08", {
        sourceType: "rule",
        evidence: cta[0],
        span: [cta.index, cta.index + cta[0].length],
        description: `Asks you to "${cta[0]}" through a link that is not an official domain (${unofficial[0].host}).`,
        metadata: { host: unofficial[0].host },
      })
    );
  }
  for (const link of extractLinks(message)) {
    if (isShortener(link.host)) {
      out.push(makeSignal("URL-05", { sourceType: "rule", evidence: link.url, span: link.span, metadata: { host: link.host }, extra: { domain: link.host } }));
    }
    if (link.username) {
      out.push(
        makeSignal("URL-07", {
          sourceType: "rule",
          evidence: link.url,
          span: link.span,
          description: `The link looks like "${link.username}" but actually opens ${link.host}`,
          metadata: { host: link.host, disguisedAs: link.username },
          extra: { domain: link.host },
        })
      );
    }
  }
  for (const m of message.matchAll(IP_URL_RE)) {
    if (!m[1].split(".").every((o) => Number(o) <= 255)) continue;
    // A bare dotted quad without scheme or path is more likely a version or
    // reference number than a link.
    if (!/^https?:\/\//i.test(m[0]) && !m[0].includes("/")) continue;
    out.push(makeSignal("URL-06", { sourceType: "rule", evidence: m[0], span: [m.index, m.index + m[0].length], metadata: { host: m[1] }, extra: { domain: m[1] } }));
  }
  return out;
}
