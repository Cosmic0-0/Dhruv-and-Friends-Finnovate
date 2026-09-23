// Non-LLM, deterministic - the single source of truth for "who is a known
// institution and which domains are officially theirs". Loaded once from
// data/institution-registry.json (see that file's `notes`: nothing in it
// may be invented; unverified entries are flagged, never silently trusted
// as verified).

import { readFileSync } from "node:fs";

const REGISTRY_URL = new URL("../../../../data/institution-registry.json", import.meta.url);
const raw = JSON.parse(readFileSync(REGISTRY_URL, "utf8"));

export const REGISTRY_VERSION = raw.version;

export const INSTITUTIONS = Object.freeze(
  raw.institutions.map((inst) =>
    Object.freeze({
      ...inst,
      official_domains: inst.official_domains.map((d) => d.toLowerCase()),
      matchers: inst.match_patterns.map((p) => new RegExp(p, "i")),
    })
  )
);

export const OFFICIAL_DOMAINS = Object.freeze([...new Set(INSTITUTIONS.flatMap((i) => i.official_domains))]);

// Legacy shape kept for existing callers (community-signals): brand token ->
// primary official domain.
export const BRAND_DOMAIN_MAP = Object.freeze(
  Object.fromEntries(INSTITUTIONS.flatMap((i) => i.brand_tokens.map((t) => [t, i.official_domains[0]])))
);
export const BRAND_TOKENS = Object.freeze(Object.keys(BRAND_DOMAIN_MAP));

export function getInstitution(id) {
  return INSTITUTIONS.find((i) => i.id === id) ?? null;
}

export function institutionForToken(token) {
  return INSTITUTIONS.find((i) => i.brand_tokens.includes(token)) ?? null;
}

export function normalizeHost(host) {
  return String(host || "")
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

/**
 * The canonical "does this host belong to this official domain" check:
 * exact apex OR any subdomain of it (internet.mcb.mu belongs to mcb.mu).
 * The "." prefix stops notmcb.mu from matching mcb.mu.
 */
export function isOfficialHost(host, officialDomain) {
  const h = normalizeHost(host);
  const d = normalizeHost(officialDomain);
  return h === d || h.endsWith(`.${d}`);
}

/** The registry institution that officially owns `host`, or null. */
export function institutionForHost(host) {
  return INSTITUTIONS.find((i) => i.official_domains.some((d) => isOfficialHost(host, d))) ?? null;
}

/**
 * Institutions the message text claims to be from, in order of first
 * appearance. Deterministic regex over registry match_patterns only.
 */
export function findClaimedInstitutions(text) {
  const hits = [];
  for (const inst of INSTITUTIONS) {
    let first = Infinity;
    let evidence = null;
    for (const re of inst.matchers) {
      const m = re.exec(text);
      if (m && m.index < first) {
        first = m.index;
        evidence = { text: m[0], span: [m.index, m.index + m[0].length] };
      }
    }
    if (evidence) hits.push({ institution: inst, index: first, evidence });
  }
  return hits.sort((a, b) => a.index - b.index);
}

export function findClaimedInstitution(text) {
  return findClaimedInstitutions(text)[0] ?? null;
}

/** Does free text (e.g. a beneficiary name) refer to this institution? */
export function textRefersToInstitution(text, institution) {
  return institution.matchers.some((re) => re.test(text)) || institution.names.some((n) => text.toLowerCase().includes(n.toLowerCase()));
}
