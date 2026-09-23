// Organisation-scoped observation store for workplace email (services/org-intel).
//
// Holds NO message text, NO subject and NO raw email address: an observation
// is (input hash, pseudonymous sender/recipient keys, sender domain, level),
// and an indicator row is a normalised shared indicator (domain, link host,
// account last-4, payee name key, risky attachment pattern) - addresses only
// ever appear as HMAC pseudonyms. Every table is keyed by org_id so one
// deployment can serve several organisations without mixing their data.
//
// Duplicate protection lives in the primary keys:
//   - the same email (input hash) is observed once per organisation;
//   - an indicator is counted once per email, however often it is resubmitted;
//   - an analyst has one (latest) label per email.

import { db } from "./index.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS org_email_observations (
    org_id TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sender_key TEXT,
    sender_domain TEXT,
    recipient_key TEXT,
    level TEXT NOT NULL,
    flagged INTEGER NOT NULL,
    PRIMARY KEY (org_id, input_hash)
  );
  CREATE INDEX IF NOT EXISTS idx_org_obs_sender ON org_email_observations (org_id, sender_key);
  CREATE INDEX IF NOT EXISTS idx_org_obs_domain ON org_email_observations (org_id, sender_domain);
  CREATE TABLE IF NOT EXISTS org_indicators (
    org_id TEXT NOT NULL,
    indicator TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    flagged INTEGER NOT NULL,
    PRIMARY KEY (org_id, indicator, input_hash)
  );
  CREATE INDEX IF NOT EXISTS idx_org_indicators_created ON org_indicators (org_id, created_at);
  CREATE TABLE IF NOT EXISTS org_outcomes (
    org_id TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    analyst_key TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (org_id, input_hash, analyst_key)
  );
`);

const insertObservation = db.prepare(`
  INSERT OR IGNORE INTO org_email_observations (org_id, input_hash, created_at, sender_key, sender_domain, recipient_key, level, flagged)
  VALUES (@orgId, @inputHash, @createdAt, @senderKey, @senderDomain, @recipientKey, @level, @flagged)
`);
const insertIndicator = db.prepare(`
  INSERT OR IGNORE INTO org_indicators (org_id, indicator, input_hash, created_at, flagged)
  VALUES (@orgId, @indicator, @inputHash, @createdAt, @flagged)
`);

/** Records one analysed email; a resubmission of the same email is a no-op. @returns {boolean} newly recorded */
export const recordOrgObservation = db.transaction(({ orgId, inputHash, createdAt, senderKey, senderDomain, recipientKey, level, flagged, indicators }) => {
  const res = insertObservation.run({ orgId, inputHash, createdAt, senderKey, senderDomain, recipientKey, level, flagged: flagged ? 1 : 0 });
  if (res.changes === 0) return false;
  for (const indicator of indicators) insertIndicator.run({ orgId, indicator, inputHash, createdAt, flagged: flagged ? 1 : 0 });
  return true;
});

export function getOrgObservation(orgId, inputHash) {
  return db.prepare("SELECT * FROM org_email_observations WHERE org_id = ? AND input_hash = ?").get(orgId, inputHash) ?? null;
}

/**
 * Other emails (not `excludeHash`) sharing any of `indicators` since `sinceIso`,
 * joined with their observation: one row per (indicator, email).
 */
export function getIndicatorPeers(orgId, indicators, sinceIso, excludeHash) {
  if (indicators.length === 0) return [];
  const placeholders = indicators.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT i.indicator, i.input_hash, i.created_at, i.flagged, o.sender_key, o.recipient_key
       FROM org_indicators i JOIN org_email_observations o ON o.org_id = i.org_id AND o.input_hash = i.input_hash
       WHERE i.org_id = ? AND i.indicator IN (${placeholders}) AND i.created_at >= ? AND i.input_hash != ?`
    )
    .all(orgId, ...indicators, sinceIso, excludeHash);
}

/** Emails previously seen from this sender pseudonym / sender domain (not `excludeHash`). */
export function getSenderPeers(orgId, { senderKey, senderDomain }, excludeHash) {
  return db
    .prepare(
      `SELECT input_hash, created_at, sender_key, sender_domain FROM org_email_observations
       WHERE org_id = ? AND input_hash != ? AND ((? IS NOT NULL AND sender_key = ?) OR (? IS NOT NULL AND sender_domain = ?))`
    )
    .all(orgId, excludeHash, senderKey, senderKey, senderDomain, senderDomain);
}

/** Duplicate-safe internal reputation for one domain. */
export function getDomainReputation(orgId, senderDomain) {
  if (!senderDomain) return { uniqueEmails: 0, uniqueSuspiciousEmails: 0, uniqueRecipients: 0, firstObserved: null, lastObserved: null };
  const row = db.prepare(
    `SELECT COUNT(*) AS unique_emails,
            SUM(CASE WHEN flagged = 1 THEN 1 ELSE 0 END) AS suspicious_emails,
            COUNT(DISTINCT CASE WHEN recipient_key IS NOT NULL THEN recipient_key END) AS unique_recipients,
            MIN(created_at) AS first_observed,
            MAX(created_at) AS last_observed
     FROM org_email_observations WHERE org_id = ? AND sender_domain = ?`
  ).get(orgId, senderDomain);
  return {
    uniqueEmails: row.unique_emails ?? 0,
    uniqueSuspiciousEmails: row.suspicious_emails ?? 0,
    uniqueRecipients: row.unique_recipients ?? 0,
    firstObserved: row.first_observed ?? null,
    lastObserved: row.last_observed ?? null,
  };
}

/** Emails (any) sharing one of `indicators`, for the confirmed-fraud lookup. */
export function getIndicatorEmails(orgId, indicators, excludeHash) {
  if (indicators.length === 0) return [];
  const placeholders = indicators.map(() => "?").join(",");
  return db
    .prepare(`SELECT indicator, input_hash FROM org_indicators WHERE org_id = ? AND indicator IN (${placeholders}) AND input_hash != ?`)
    .all(orgId, ...indicators, excludeHash);
}

export function upsertOrgOutcome({ orgId, inputHash, analystKey, label, createdAt }) {
  db.prepare(
    `INSERT INTO org_outcomes (org_id, input_hash, analyst_key, label, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (org_id, input_hash, analyst_key) DO UPDATE SET label = excluded.label, created_at = excluded.created_at`
  ).run(orgId, inputHash, analystKey, label, createdAt);
}

export function getOrgOutcomes(orgId, inputHashes) {
  if (inputHashes.length === 0) return [];
  const placeholders = inputHashes.map(() => "?").join(",");
  return db
    .prepare(`SELECT input_hash, analyst_key, label, created_at FROM org_outcomes WHERE org_id = ? AND input_hash IN (${placeholders})`)
    .all(orgId, ...inputHashes);
}

/** Flagged indicator rows since `sinceIso` - the raw material for the campaign list. */
export function getFlaggedIndicatorRows(orgId, sinceIso) {
  return db
    .prepare(
      `SELECT i.indicator, i.input_hash, i.created_at, o.sender_key, o.recipient_key
       FROM org_indicators i JOIN org_email_observations o ON o.org_id = i.org_id AND o.input_hash = i.input_hash
       WHERE i.org_id = ? AND i.flagged = 1 AND i.created_at >= ?`
    )
    .all(orgId, sinceIso);
}

export function purgeOrgData(beforeIso) {
  db.prepare("DELETE FROM org_indicators WHERE created_at < ?").run(beforeIso);
  db.prepare("DELETE FROM org_email_observations WHERE created_at < ?").run(beforeIso);
  db.prepare("DELETE FROM org_outcomes WHERE input_hash NOT IN (SELECT input_hash FROM org_email_observations)").run();
}
