// Non-LLM, deterministic — must stay unit-testable independent of the LLM call path
// (mirrors services/domain-matching/index.js).
//
// Compares what a message claims about "who this is from" against facts code
// can check:
//   ID-01  claimed registry institution, but a link points to a host that is
//          not one of its official domains (subdomains of an official domain
//          ARE official - see institutions.isOfficialHost; shorteners are not
//          treated as a mismatch, they get their own weak URL-05 signal)
//   ID-02  claimed registry institution, but the stated payment beneficiary
//          is someone else
// Institution data comes from data/institution-registry.json.

import { findClaimedInstitution, isOfficialHost, textRefersToInstitution } from "../institutions/index.js";
import { extractLinks, SHORTENER_HOSTS } from "../domain-matching/index.js";
import { makeSignal } from "../signals/registry.js";

// English + French phrasing for "who gets the money". Deliberately excludes
// anything starting with a URL scheme so a link right after "transfer to"
// isn't misread as a beneficiary name, and stops consuming further words at
// a trailing preposition/adverb ("... to John Peter to receive it").
const NAME_WORD = "(?!to\\b|now\\b|today\\b|please\\b|immediately\\b|urgently\\b)[a-z][a-z'-]*";
const BENEFICIARY_PATTERNS = [
  new RegExp(`(?:beneficiary|recipient|payee|b[ée]n[ée]ficiaire)\\s*[:\\-]?\\s*(?!https?:)(${NAME_WORD}(?:\\s+${NAME_WORD}){0,3})`, "i"),
  new RegExp(`(?:pay(?:ment)?|transfer|send(?:\\s+the)?(?:\\s+money)?|envoyer|payer)\\s+(?:to|à)\\s+(?!https?:)(${NAME_WORD}(?:\\s+${NAME_WORD}){0,3})`, "i"),
];

export function extractBeneficiary(message) {
  for (const pattern of BENEFICIARY_PATTERNS) {
    const match = pattern.exec(message);
    if (match) {
      const name = match[1].trim();
      const start = match.index + match[0].lastIndexOf(match[1]);
      return { name, span: [start, start + name.length] };
    }
  }
  return null;
}

function isOfficialFor(host, institution) {
  return institution.official_domains.some((d) => isOfficialHost(host, d));
}

export function checkIdentityConsistency(message) {
  const claim = findClaimedInstitution(message);
  if (!claim) return [];
  const { institution } = claim;
  const claimedIdentity = institution.display_name;
  const officialDomain = institution.official_domains[0];
  const signals = [];

  const mismatched = extractLinks(message).find(
    (l) => !SHORTENER_HOSTS.includes(l.host) && !isOfficialFor(l.host, institution)
  );
  if (mismatched) {
    signals.push(
      makeSignal("ID-01", {
        sourceType: "rule",
        evidence: mismatched.url,
        span: mismatched.span,
        description: `The message claims to be from ${claimedIdentity} but the link points to a different domain (${mismatched.host}, not ${claimedIdentity}'s official domain ${officialDomain}).`,
        metadata: { host: mismatched.host, institutionId: institution.id, claimEvidence: claim.evidence },
        extra: { claimedIdentity, officialDomain, actualDomain: mismatched.host },
      })
    );
  }

  const beneficiary = extractBeneficiary(message);
  if (beneficiary && !textRefersToInstitution(beneficiary.name, institution)) {
    signals.push(
      makeSignal("ID-02", {
        sourceType: "rule",
        evidence: beneficiary.name,
        span: beneficiary.span,
        description: `The message claims to be from ${claimedIdentity} but the payment is directed to "${beneficiary.name}", not ${claimedIdentity}.`,
        metadata: { institutionId: institution.id, claimEvidence: claim.evidence },
        extra: { claimedIdentity, officialDomain, beneficiary: beneficiary.name },
      })
    );
  }
  return signals;
}
