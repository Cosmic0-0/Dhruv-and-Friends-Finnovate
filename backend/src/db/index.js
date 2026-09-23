import Database from "better-sqlite3";

export const db = new Database(process.env.DATABASE_URL || "./fraudlens.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS scam_dna (
    fingerprint_id TEXT PRIMARY KEY, scam_type TEXT NOT NULL, claimed_identity TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS scam_dna_senders (
    fingerprint_id TEXT NOT NULL, sender TEXT NOT NULL,
    PRIMARY KEY (fingerprint_id, sender)
  );
  CREATE TABLE IF NOT EXISTS scam_dna_domains (
    fingerprint_id TEXT NOT NULL, domain TEXT NOT NULL,
    PRIMARY KEY (fingerprint_id, domain)
  );
  CREATE TABLE IF NOT EXISTS reports (
    sender TEXT PRIMARY KEY,
    report_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS batch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total INTEGER, scam_count INTEGER, suspicious_count INTEGER, safe_count INTEGER
  );
  CREATE TABLE IF NOT EXISTS domain_age_cache (
    domain TEXT PRIMARY KEY,
    registered_at TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
  -- Timestamped evidence events for community cluster/wave detection
  -- (services/community-signals). Holds NO raw message text and NO raw IP:
  -- only one-way fingerprints of the redacted text and an HMAC pseudonym
  -- of the reporter. Purged after COMMUNITY_EVENT_RETENTION_DAYS.
  CREATE TABLE IF NOT EXISTS report_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('user_report', 'auto_high_confidence')),
    sender_key TEXT,
    template_hash TEXT NOT NULL,
    simhash TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    brand_claimed TEXT,
    lookalike_hosts TEXT NOT NULL DEFAULT '[]',
    reporter_hash TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_report_events_created_at ON report_events (created_at);
  -- One row per risk adjustment made from community evidence: which rule,
  -- which threshold version, which evidence rows, what changed. Lets any
  -- adjusted verdict be re-derived and explained after the fact.
  CREATE TABLE IF NOT EXISTS risk_audit_log (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    rules_version TEXT NOT NULL,
    risk_delta INTEGER NOT NULL,
    verdict_from TEXT NOT NULL,
    verdict_to TEXT NOT NULL,
    evidence_event_ids TEXT NOT NULL,
    metrics TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_risk_audit_log_created_at ON risk_audit_log (created_at);
`);

const DOMAIN_AGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Caches the registration DATE, not a precomputed age - so a cache hit still
// reports today's accurate age instead of freezing it at whatever it was 24h
// ago. The TTL only governs how long we go without re-hitting the RDAP
// network call (see services/domain-age), which is what repeated demo runs
// of the same domain need to avoid.
export function getCachedDomainRegistration(domain) {
  const row = db.prepare("SELECT registered_at, fetched_at FROM domain_age_cache WHERE domain = ?").get(domain);
  if (!row) return undefined;
  if (Date.now() - new Date(row.fetched_at).getTime() > DOMAIN_AGE_CACHE_TTL_MS) return undefined;
  return row.registered_at;
}

export function cacheDomainRegistration(domain, registeredAtIso) {
  db.prepare(
    `INSERT INTO domain_age_cache (domain, registered_at, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET registered_at = excluded.registered_at, fetched_at = excluded.fetched_at`
  ).run(domain, registeredAtIso, new Date().toISOString());
}

// Normalizes a sender identifier to a canonical digits-only form (assuming
// the 230 Mauritius country code for 8-digit local numbers) so the same
// number submitted in different formats ("+230 5789 1234", "+23057891234",
// "57891234") dedupes to one row instead of three (see
// data/test-payloads/FINDINGS.md #4). This is purely an internal DB key —
// the API still echoes back the raw string the client submitted.
export function normalizeSender(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) {
    // Not phone-number-shaped at all - a brand/identity name like "MCB" or
    // "Emtel Prize Team", as extracted by the LLM's `sender` field
    // (backend/src/services/analysis/index.js), rather than a user-submitted
    // phone number. Falling through to the digits-only key below would
    // collapse every such sender to the same empty string, making
    // senderReports meaningless for exactly the spoofed-identity case it
    // exists for. Key on the normalized string itself instead.
    return raw.trim().toLowerCase().replace(/\s+/g, " ");
  }
  if (digits.length <= 8 && !digits.startsWith("230")) {
    return `230${digits}`;
  }
  return digits;
}

export function reportSender(sender) {
  const key = normalizeSender(sender);
  db.prepare(
    `INSERT INTO reports (sender, report_count) VALUES (?, 1)
     ON CONFLICT(sender) DO UPDATE SET report_count = report_count + 1`
  ).run(key);
  return db.prepare("SELECT report_count FROM reports WHERE sender = ?").get(key).report_count;
}

export function getReportCount(sender) {
  const key = normalizeSender(sender);
  const row = db.prepare("SELECT report_count FROM reports WHERE sender = ?").get(key);
  return row ? row.report_count : 0;
}

export function insertReportEvent(event) {
  const info = db
    .prepare(
      `INSERT INTO report_events
        (created_at, origin, sender_key, template_hash, simhash, token_count, brand_claimed, lookalike_hosts, reporter_hash, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.createdAt,
      event.origin,
      event.senderKey ?? null,
      event.templateHash,
      event.simhash,
      event.tokenCount,
      event.brandClaimed ?? null,
      JSON.stringify(event.lookalikeHosts ?? []),
      event.reporterHash,
      JSON.stringify(event.evidence ?? {})
    );
  return Number(info.lastInsertRowid);
}

// Bounded read: the wave rules only ever look back lookbackDays +
// baselineDays + 1, and the LIMIT keeps a flood of events from turning one
// /api/analyze call into an unbounded scan.
export function getReportEventsSince(sinceIso, limit = 5000) {
  return db
    .prepare(
      `SELECT id, created_at, origin, sender_key, template_hash, simhash, token_count, lookalike_hosts, reporter_hash
       FROM report_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(sinceIso, limit)
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      origin: r.origin,
      senderKey: r.sender_key,
      templateHash: r.template_hash,
      simhash: r.simhash,
      tokenCount: r.token_count,
      lookalikeHosts: JSON.parse(r.lookalike_hosts),
      reporterHash: r.reporter_hash,
    }));
}

export function insertRiskAudit(entry) {
  db.prepare(
    `INSERT INTO risk_audit_log
      (id, created_at, rule_id, rules_version, risk_delta, verdict_from, verdict_to, evidence_event_ids, metrics)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id,
    entry.createdAt,
    entry.ruleId,
    entry.rulesVersion,
    entry.riskDelta,
    entry.verdictFrom,
    entry.verdictTo,
    JSON.stringify(entry.evidenceEventIds),
    JSON.stringify(entry.metrics)
  );
}

export function purgeCommunityData(eventCutoffIso, auditCutoffIso) {
  const events = db.prepare("DELETE FROM report_events WHERE created_at < ?").run(eventCutoffIso).changes;
  const audits = db.prepare("DELETE FROM risk_audit_log WHERE created_at < ?").run(auditCutoffIso).changes;
  return { events, audits };
}

export function saveBatchHistory(summary) {
  db.prepare(
    `INSERT INTO batch_history (total, scam_count, suspicious_count, safe_count) VALUES (?, ?, ?, ?)`
  ).run(summary.total, summary.scamCount, summary.suspiciousCount, summary.safeCount);
}

// Real aggregate counts for the Radar/trends page (GET /api/trends) - every
// number here comes from an actual report or a real recorded ScamDNA
// observation (services/scam-dna), never synthesized. An empty/near-empty
// demo database returns empty arrays and zero totals; the route/frontend
// must show that honestly rather than padding it with invented activity
// (see CLAUDE.md "Do not create fake live Mauritius statistics").
export function getTrendSummary(limit = 5) {
  const topSenders = db
    .prepare("SELECT sender, report_count FROM reports ORDER BY report_count DESC LIMIT ?")
    .all(limit);
  const topCampaigns = db
    .prepare(
      "SELECT fingerprint_id, scam_type, claimed_identity, message_count FROM scam_dna ORDER BY message_count DESC LIMIT ?"
    )
    .all(limit);
  const scamTypeCounts = db
    .prepare(
      "SELECT scam_type, COUNT(*) AS campaigns, SUM(message_count) AS messages FROM scam_dna GROUP BY scam_type ORDER BY messages DESC"
    )
    .all();
  const totals = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM reports) AS reportedSenders,
        (SELECT COALESCE(SUM(report_count), 0) FROM reports) AS totalReports,
        (SELECT COUNT(*) FROM scam_dna) AS campaigns,
        (SELECT COUNT(DISTINCT domain) FROM scam_dna_domains) AS domains`
    )
    .get();
  return { topSenders, topCampaigns, scamTypeCounts, totals };
}
