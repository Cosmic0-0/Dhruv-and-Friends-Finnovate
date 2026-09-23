// Who does this page claim to be, and does anything give it away as a
// phishing kit? Reads the page metadata and links the extension collected
// (extension/collect-signals.js `pageMeta`) plus one passive GET of the
// site's own privacy-policy page. Deterministic.
//
// These findings are about INTENT, not engineering quality, so they never
// cost points in the security grade (see index.js). Findings marked
// `hostile: true` are things a merely badly built site doesn't do, and they
// make intent.js call the site malicious:
//   - the canonical / og:url points at a real institution's or brand's site
//     (the page was copied from it),
//   - the title or site name claims an institution on a page asking for a
//     password or card, on a site that isn't that institution's,
//   - logos, icons or stylesheets are loaded straight from the real
//     institution's domain by a page that asks for credentials,
//   - the "privacy policy" link goes to a real institution's policy,
//   - code or a form sends data to a Telegram bot or a Discord webhook.
// The rest (no privacy policy, a broken one, right-click blocked, obfuscated
// code) are common on poorly built sites too, so they stay non-hostile.

import { findClaimedInstitution, institutionForHost, normalizeHost } from "../institutions/index.js";
import { isSameSite, registrableDomain } from "../domain-matching/index.js";
import { GLOBAL_BRAND_DOMAINS } from "../domain-matching/globalBrands.js";
import { fetchOnce } from "./fetcher.js";

const MAX_TEXT = 300;
const MAX_ITEMS = 30;
const PRIVACY_FETCH_TIMEOUT_MS = 5000;

const str = (v, max = MAX_TEXT) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v, max = MAX_ITEMS) => (Array.isArray(v) ? v.slice(0, max) : []);

function hostOf(url, base) {
  try {
    return normalizeHost(new URL(url, base).hostname);
  } catch {
    return "";
  }
}

/** The real organisation a host belongs to: a registry institution or a global brand. */
function ownerOf(host) {
  if (!host) return null;
  const inst = institutionForHost(host);
  if (inst) return { name: inst.display_name, domain: inst.official_domains[0] };
  const brand = GLOBAL_BRAND_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`));
  return brand ? { name: brand, domain: brand } : null;
}

const loc = (value) => (Array.isArray(value) ? { locations: value.slice(0, 3) } : {});

/** Normalised, bounded copy of the collector's pageMeta. Untrusted page data. */
export function readPageMeta(raw) {
  if (!raw || typeof raw !== "object") return null;
  const links = (v) => arr(v, 5).map((l) => ({ href: str(l?.href, 500), text: str(l?.text, 120) })).filter((l) => l.href);
  return {
    title: str(raw.title),
    description: str(raw.description),
    siteName: str(raw.siteName, 120),
    canonical: str(raw.canonical, 500),
    ogUrl: str(raw.ogUrl, 500),
    generator: str(raw.generator, 120),
    privacyLinks: links(raw.privacyLinks),
    termsLinks: links(raw.termsLinks),
    contactLinks: links(raw.contactLinks),
    assetHosts: arr(raw.assetHosts).map((a) => ({ host: normalizeHost(str(a?.host, 253)), kind: str(a?.kind, 20), ...loc(a?.locations) })).filter((a) => a.host),
    hasCredentialField: raw.hasCredentialField === true,
    exfil: arr(raw.exfil, 5).map((e) => ({ target: str(e?.target, 60), ...loc(e?.locations) })).filter((e) => e.target),
    contextMenuBlocked: raw.contextMenuBlocked === true ? { ...loc(raw.contextMenuLocations) } : null,
    obfuscation: raw.obfuscation === true ? { ...loc(raw.obfuscationLocations) } : null,
  };
}

function clonedFrom(meta, pageHost) {
  for (const [field, url] of [["canonical link", meta.canonical], ["og:url", meta.ogUrl]]) {
    const host = hostOf(url, `https://${pageHost}/`);
    if (!host || isSameSite(host, pageHost)) continue;
    const owner = ownerOf(host);
    if (owner && !ownerOf(pageHost)) return { field, host, owner, url };
  }
  return null;
}

function claimedInTitle(meta, pageHost) {
  const text = `${meta.title} ${meta.siteName}`;
  const claim = findClaimedInstitution(text)?.institution;
  if (claim && !claim.official_domains.some((d) => pageHost === d || pageHost.endsWith(`.${d}`))) {
    return { name: claim.display_name, domain: claim.official_domains[0] };
  }
  const lower = text.toLowerCase();
  const brand = GLOBAL_BRAND_DOMAINS.find((d) => {
    const label = d.split(".")[0];
    return label.length >= 5 && lower.includes(label) && !(pageHost === d || pageHost.endsWith(`.${d}`));
  });
  return brand ? { name: brand.split(".")[0], domain: brand } : null;
}

/**
 * Findings from the page's metadata and links.
 * @param {ReturnType<typeof readPageMeta>} meta
 * @param {string} pageUrl
 */
export function pageIdentityFindings(meta, pageUrl) {
  if (!meta) return [];
  const pageHost = hostOf(pageUrl);
  const findings = [];
  const ownSite = ownerOf(pageHost);

  const cloned = clonedFrom(meta, pageHost);
  if (cloned) {
    findings.push({
      category: "identity",
      severity: "high",
      hostile: true,
      title: "Page metadata points to another organisation's website",
      description: `This page's ${cloned.field} says it is ${cloned.url}, a page on ${cloned.owner.name}'s site (${cloned.owner.domain}). Copied pages keep this tag from the site they were cloned from.`,
      evidence: `${cloned.field}: ${cloned.url}`,
    });
  }

  const claim = !ownSite && meta.hasCredentialField ? claimedInTitle(meta, pageHost) : null;
  if (claim) {
    findings.push({
      category: "identity",
      severity: "high",
      hostile: true,
      title: "Page claims to be another organisation and asks for credentials",
      description: `The page title or site name presents it as ${claim.name}, and it asks for a password or card details, but ${pageHost} is not ${claim.name}'s website (${claim.domain}).`,
      evidence: meta.siteName ? `${meta.title} · ${meta.siteName}` : meta.title,
    });
  }

  if (!ownSite && (meta.hasCredentialField || claim || cloned)) {
    const borrowed = meta.assetHosts.filter((a) => !isSameSite(a.host, pageHost) && ownerOf(a.host));
    if (borrowed.length > 0) {
      const owner = ownerOf(borrowed[0].host);
      findings.push({
        category: "identity",
        severity: "high",
        hostile: true,
        title: "Page loads its branding from another organisation's website",
        description: `Logos, icons or styles on this page are loaded directly from ${owner.name}'s site (${borrowed[0].host}). Phishing kits do this so the copy looks exactly like the real thing.`,
        evidence: [...new Set(borrowed.map((a) => `${a.kind || "asset"} from ${a.host}`))].slice(0, 3).join("; "),
        ...(borrowed[0].locations ? { locations: borrowed.flatMap((a) => a.locations ?? []).slice(0, 3) } : {}),
      });
    }
  }

  for (const e of meta.exfil) {
    findings.push({
      category: "identity",
      severity: "high",
      hostile: true,
      title: `Page sends data to ${e.target}`,
      description: `This page's code or form sends data to ${e.target}. Legitimate sites don't collect form input this way; phishing kits use it to receive stolen logins.`,
      evidence: e.target,
      ...(e.locations ? { locations: e.locations } : {}),
    });
  }

  if (meta.contextMenuBlocked) {
    findings.push({
      category: "identity",
      severity: "low",
      title: "Right-click is disabled",
      description: "The page blocks the right-click menu. Some sites do this to protect images, but it's also used to stop visitors inspecting a fake page.",
      ...meta.contextMenuBlocked,
    });
  }

  if (meta.obfuscation) {
    findings.push({
      category: "identity",
      severity: "medium",
      title: "Page runs deliberately hidden (obfuscated) code",
      description: "The page decodes a hidden string and runs it as code (for example eval(atob(...))). Real sites rarely need this; it's used to hide what a page does from scanners.",
      ...meta.obfuscation,
    });
  }

  return findings;
}

/**
 * Privacy policy: is there one, is it this site's own, and does it load?
 * One passive GET of a same-site policy link, through the SSRF-guarded fetcher.
 * @returns {Promise<{ finding: object|null, status: "found"|"missing"|"broken"|"foreign"|"unknown", url: string|null, owner?: string }>}
 */
export async function checkPrivacyPolicy(meta, pageUrl, { fetch = fetchOnce } = {}) {
  if (!meta) return { finding: null, status: "unknown", url: null };
  const pageHost = hostOf(pageUrl);
  const link = meta.privacyLinks[0];
  if (!link) {
    return {
      status: "missing",
      url: null,
      finding: {
        category: "identity",
        severity: "low",
        title: "No privacy policy link",
        description: "The page doesn't link to a privacy policy. Genuine businesses and government services that collect personal data normally publish one; scam pages usually don't bother.",
      },
    };
  }
  const url = (() => {
    try {
      return new URL(link.href, pageUrl).href;
    } catch {
      return null;
    }
  })();
  const host = url ? hostOf(url) : "";
  if (host && !isSameSite(host, pageHost)) {
    const owner = ownerOf(host);
    if (owner && !ownerOf(pageHost)) {
      return {
        status: "foreign",
        url,
        owner: owner.name,
        finding: {
          category: "identity",
          severity: "high",
          hostile: true,
          title: "Privacy policy link goes to another organisation's website",
          description: `The privacy policy link points to ${owner.name}'s own policy (${host}). A copied page keeps the real site's links; a genuine site links to its own.`,
          evidence: url,
        },
      };
    }
    return { finding: null, status: "found", url }; // hosted policy services (e.g. a legal-docs platform) are normal
  }
  try {
    const res = await fetch(url, { timeoutMs: PRIVACY_FETCH_TIMEOUT_MS, maxBodyBytes: 64 * 1024 });
    if (res.status >= 200 && res.status < 400) return { finding: null, status: "found", url };
    return {
      status: "broken",
      url,
      finding: {
        category: "identity",
        severity: "low",
        title: "Privacy policy link is broken",
        description: `The privacy policy link returns HTTP ${res.status}. Often just neglect on an older site, but worth knowing before you share personal details.`,
        evidence: url,
      },
    };
  } catch {
    return { finding: null, status: "unknown", url };
  }
}

/** Registrable domain of the page, for the key-checks panel's wording. */
export function siteName(pageUrl) {
  return registrableDomain(hostOf(pageUrl));
}
