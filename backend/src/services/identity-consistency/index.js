// Non-LLM, deterministic — must stay unit-testable independent of the LLM call path
// (mirrors services/domain-matching/index.js).
//
// Compares three things a message can claim/imply about "who this is from":
//   1. the claimed sender/identity, extracted from the message text itself
//      (a known bank/telecom/government brand token, e.g. "MCB", "MRA")
//   2. the domain of any URL in the message — reuses domain-matching's
//      extractHostnames()/BRAND_DOMAIN_MAP, does not reimplement URL parsing
//   3. a payment beneficiary/recipient name, if the message states one
//      (plain text only — no QR decoding, no image parsing)
// If the claimed identity doesn't match the linked domain and/or the stated
// beneficiary, that's a strong deterministic scam indicator: real
// institutions don't send you to a different institution's domain or ask
// you to pay an unrelated personal beneficiary.

import { BRAND_DOMAIN_MAP, BRAND_TOKENS, extractHostnames } from "../domain-matching/index.js";

const DISPLAY_NAMES = {
  mcb: "MCB",
  sbm: "SBM",
  absa: "Absa",
  bankone: "Bank One",
  myt: "my.t",
  emtel: "Emtel",
  mra: "MRA",
};

// One pattern per known brand token, used both to spot the claimed identity
// in the message and to check whether a beneficiary name references it.
const IDENTITY_PATTERNS = {
  mcb: /\bmcb\b/i,
  sbm: /\bsbm\b/i,
  absa: /\babsa\b/i,
  bankone: /\bbank\s?one\b/i,
  myt: /\bmy\.?t\b/i,
  emtel: /\bemtel\b/i,
  mra: /\bmra\b/i,
};

function extractClaimedIdentity(message) {
  return BRAND_TOKENS.find((token) => IDENTITY_PATTERNS[token].test(message)) || null;
}

// English + French phrasing for "who gets the money". Deliberately excludes
// anything starting with a URL scheme so a link right after "transfer to"
// isn't misread as a beneficiary name, and stops consuming further words at
// a trailing preposition/adverb ("... to John Peter to receive it") so the
// captured name doesn't run on into the rest of the sentence.
const NAME_WORD = "(?!to\\b|now\\b|today\\b|please\\b|immediately\\b|urgently\\b)[a-z][a-z'-]*";
const BENEFICIARY_PATTERNS = [
  new RegExp(`(?:beneficiary|recipient|payee|b[ée]n[ée]ficiaire)\\s*[:\\-]?\\s*(?!https?:)(${NAME_WORD}(?:\\s+${NAME_WORD}){0,3})`, "i"),
  new RegExp(`(?:pay(?:ment)?|transfer|send(?:\\s+the)?(?:\\s+money)?|envoyer|payer)\\s+(?:to|à)\\s+(?!https?:)(${NAME_WORD}(?:\\s+${NAME_WORD}){0,3})`, "i"),
];

function extractBeneficiary(message) {
  for (const pattern of BENEFICIARY_PATTERNS) {
    const match = message.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

export function checkIdentityConsistency(message) {
  const claimed = extractClaimedIdentity(message);
  if (!claimed) return [];

  const expectedDomain = BRAND_DOMAIN_MAP[claimed];
  const hostnames = extractHostnames(message);
  const mismatchedHost = hostnames.find((host) => host !== expectedDomain);
  const domainMismatch = Boolean(mismatchedHost);

  const beneficiary = extractBeneficiary(message);
  const beneficiaryMismatch = beneficiary !== null && !IDENTITY_PATTERNS[claimed].test(beneficiary);

  if (!domainMismatch && !beneficiaryMismatch) return [];

  const claimedName = DISPLAY_NAMES[claimed];
  const reasons = [];
  if (domainMismatch) {
    reasons.push(`the link points to a different domain (${mismatchedHost}, not ${claimedName}'s official domain ${expectedDomain})`);
  }
  if (beneficiaryMismatch) {
    reasons.push(`the payment is directed to "${beneficiary}", not ${claimedName}`);
  }

  // Structured fields alongside the prose `description` — additive, so a
  // "claims to be X / actually points to Y" comparison can be rendered
  // directly instead of re-parsing the sentence above.
  const signal = {
    type: "IDENTITY_MISMATCH",
    description: `The message claims to be from ${claimedName} but ${reasons.join(" and ")}.`,
    severity: "high",
    source: "identity_check",
    claimedIdentity: claimedName,
    officialDomain: expectedDomain,
  };
  if (domainMismatch) signal.actualDomain = mismatchedHost;
  if (beneficiaryMismatch) signal.beneficiary = beneficiary;

  return [signal];
}
