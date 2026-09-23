// Loads data/trusted-domains.json - see that file's `notes` for the full
// rationale and safety principle. In short: this is a plain "don't flag a
// verify/log-in/pay call-to-action through this link" allowlist, checked
// only by URL-08 (services/domain-matching's checkLinkHygiene). It is
// deliberately NOT the same thing as institution-registry.json:
//   - A trusted domain gets no impersonation/lookalike protection. URL-01
//     ..04 and ID-01/ID-02 never consult this file, so a typosquat of a
//     trusted domain is still just an ordinary "unrecognized domain" to
//     those detectors (no false SAFE claim is ever made by adding an entry
//     here).
//   - Adding a domain here can only ever REMOVE a signal (URL-08), never add
//     one - so a wrong or stale entry degrades to "one fewer accurate
//     warning," not a fabricated accusation. It is still a real risk (a
//     wrong entry could hide a genuine scam link), which is why entries here
//     must be domains a human can vouch for by name - see the data file's
//     "when in doubt, leave it out" rule.

import { readFileSync } from "node:fs";

const REGISTRY_URL = new URL("../../../../data/trusted-domains.json", import.meta.url);
const raw = JSON.parse(readFileSync(REGISTRY_URL, "utf8"));

export const TRUSTED_DOMAINS_VERSION = raw.version;

function flatten(section) {
  return Object.values(section ?? {}).flat();
}

export const TRUSTED_DOMAINS = Object.freeze(
  [...new Set([...flatten(raw.mauritius), ...flatten(raw.global)].map((d) => d.toLowerCase()))]
);

const TRUSTED_SET = new Set(TRUSTED_DOMAINS);

/**
 * Exact match or subdomain of a trusted domain (same subdomain rule as
 * institutions.isOfficialHost: pay.google.com is trusted because it ends
 * in ".google.com"; notgoogle.com is not).
 */
export function isTrustedDomain(host) {
  const h = String(host || "")
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (TRUSTED_SET.has(h)) return true;
  for (const domain of TRUSTED_SET) {
    if (h.endsWith(`.${domain}`)) return true;
  }
  return false;
}
