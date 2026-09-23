import { db } from "../../db/index.js";
import { normalizeScamType } from "../playbooks/index.js";

const clean = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 200) : "";
const slug = (value) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";

export function getFingerprintMatches(fingerprintId) {
  const row = db.prepare("SELECT * FROM scam_dna WHERE fingerprint_id = ?").get(fingerprintId);
  if (!row) return null;
  return {
    fingerprintId, scamType: row.scam_type, claimedIdentity: row.claimed_identity,
    messageCount: row.message_count,
    senders: db.prepare("SELECT sender FROM scam_dna_senders WHERE fingerprint_id = ? ORDER BY sender").all(fingerprintId).map(r => r.sender),
    domains: db.prepare("SELECT domain FROM scam_dna_domains WHERE fingerprint_id = ? ORDER BY domain").all(fingerprintId).map(r => r.domain),
  };
}

// Counts represent observed checks, never independent community reports or verified campaigns.
export const recordFingerprint = db.transaction(({ scamType, claimedIdentity, sender, domains = [] }) => {
  const type = normalizeScamType(scamType);
  if (!type) throw new TypeError("Unknown scam type");
  const identity = clean(claimedIdentity) || null;
  // Keyed primarily on the claimed identity, not scamType: live testing
  // showed the LLM's scamType classification is noticeably less stable
  // across near-identical messages than the institution it claims to be
  // from (e.g. the same "MCB" message classified as MCB_IMPERSONATION on
  // one run and BANK_ONE_IMPERSONATION on the next) - keying on scamType
  // would fragment one real campaign into several fingerprints. The
  // claimed identity is the more meaningful "same campaign" signal for the
  // bank/telecom-impersonation scams this taxonomy targets. Falls back to
  // scamType only when no identity was extracted at all.
  const fingerprintId = identity ? slug(identity) : `${type}-unknown`;
  const previous = getFingerprintMatches(fingerprintId);
  db.prepare(`INSERT INTO scam_dna (fingerprint_id, scam_type, claimed_identity, message_count)
    VALUES (?, ?, ?, 1) ON CONFLICT(fingerprint_id) DO UPDATE SET
    message_count = message_count + 1, last_seen = CURRENT_TIMESTAMP`).run(fingerprintId, type, identity);
  const observedSender = clean(sender);
  // Redacted identifiers are not actual sender identities and must not become network nodes.
  if (observedSender && !/\[(?:phone|redacted|account|email)/i.test(observedSender)) {
    db.prepare("INSERT OR IGNORE INTO scam_dna_senders VALUES (?, ?)").run(fingerprintId, observedSender);
  }
  for (const domain of new Set(domains.map(d => clean(d).toLowerCase()).filter(Boolean))) {
    db.prepare("INSERT OR IGNORE INTO scam_dna_domains VALUES (?, ?)").run(fingerprintId, domain);
  }
  return { ...getFingerprintMatches(fingerprintId), previous };
});

export function attachScamDna(result) {
  if (result.verdict === "safe" || !result.scamProfile?.type) return result;
  const match = recordFingerprint({
    scamType: result.scamProfile.type, claimedIdentity: result.scamProfile.claimedIdentity,
    sender: result.observedSender,
    domains: result.signals.filter(s => s.type === "lookalike_url" && typeof s.domain === "string").map(s => s.domain),
  });
  result.scamDna = {
    fingerprintId: match.fingerprintId, matchStrength: match.previous ? "matched" : "new",
    relatedReports: match.previous?.messageCount || 0,
    relatedSenders: match.previous?.senders.length || 0,
    relatedDomains: match.previous?.domains.length || 0,
  };
  return result;
}
