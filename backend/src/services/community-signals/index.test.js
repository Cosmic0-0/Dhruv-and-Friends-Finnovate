import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = ":memory:";
process.env.REPORTER_HASH_SECRET = "test-secret";

const { db } = await import("../../db/index.js");
const {
  applyCommunityEvidence,
  communitySenderKey,
  recordUserReport,
  reporterHash,
  purgeExpiredCommunityData,
} = await import("./index.js");

const NOW = Date.parse("2026-09-23T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const SCAM =
  "MCB: Your account is suspended. Verify now at https://mcb-secure.top/verify or call [phone 1] within 24h. Rs 5,000 fee.";

test.beforeEach(() => {
  db.exec("DELETE FROM report_events; DELETE FROM risk_audit_log;");
});

function reportFrom(n, { ageMs = HOUR, message = SCAM, sender = "57891234" } = {}) {
  for (let i = 0; i < n; i++) {
    recordUserReport({ sender, message, ip: `10.0.0.${i + 1}`, now: NOW - ageMs - i * 60_000 });
  }
}

function llmResult(overrides = {}) {
  return {
    verdict: "suspicious",
    riskScore: 60,
    signals: [{ type: "urgency_language", severity: "medium", source: "message_text" }],
    ...overrides,
  };
}

test("communitySenderKey rejects placeholders, official identities and blanks", () => {
  assert.equal(communitySenderKey("[phone 1]"), null);
  assert.equal(communitySenderKey("MCB"), null);
  assert.equal(communitySenderKey("my.t"), null);
  assert.equal(communitySenderKey("State Bank of Mauritius"), null);
  assert.equal(communitySenderKey("  "), null);
  assert.equal(communitySenderKey(undefined), null);
  assert.equal(communitySenderKey("+230 5789 1234"), "23057891234");
  assert.equal(communitySenderKey("Emtel Prize Team"), "emtel prize team");
});

test("reporterHash is a stable pseudonym and never the raw IP", () => {
  assert.equal(reporterHash("10.0.0.1"), reporterHash("10.0.0.1"));
  assert.notEqual(reporterHash("10.0.0.1"), reporterHash("10.0.0.2"));
  assert.ok(!reporterHash("10.0.0.1").includes("10.0.0.1"));
});

test("recordUserReport stores no raw message text and no raw IP", () => {
  recordUserReport({ sender: "57891234", message: SCAM, ip: "203.0.113.9", now: NOW });
  const row = db.prepare("SELECT * FROM report_events").get();
  const serialized = JSON.stringify(row);
  assert.ok(!serialized.includes("suspended"));
  assert.ok(!serialized.includes("203.0.113.9"));
  assert.equal(row.origin, "user_report");
  assert.equal(row.sender_key, "23057891234");
  assert.deepEqual(JSON.parse(row.lookalike_hosts), ["mcb-secure.top"]);
});

test("recordUserReport skips a report with neither message nor trackable sender", () => {
  assert.equal(recordUserReport({ sender: "MCB", ip: "1.1.1.1", now: NOW }), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM report_events").get().n, 0);
});

test("no community evidence -> result unchanged, no audit row", () => {
  const result = applyCommunityEvidence(llmResult(), SCAM, { ip: "1.1.1.1", now: NOW });
  assert.equal(result.verdict, "suspicious");
  assert.equal(result.riskAdjustments, undefined);
  assert.equal(result.signals.length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM risk_audit_log").get().n, 0);
});

test("wave of 5 distinct reporters -> CW-2 signal, adjusted score, and an audit row that matches", () => {
  reportFrom(5);
  const result = applyCommunityEvidence(
    llmResult({ signals: [{ type: "lookalike_url", severity: "high", source: "url_parser" }] }),
    SCAM.replace("[phone 1]", "[phone 3]"),
    { ip: "1.1.1.1", now: NOW }
  );

  const signal = result.signals.find((s) => s.source === "community_reports");
  assert.equal(signal.type, "community_wave");
  assert.equal(signal.communityEvidence.distinctReporters, 5);
  assert.equal(result.adjustedRiskScore, 80);
  assert.equal(result.riskScore, 60, "the LLM's own riskScore is preserved unchanged");
  assert.equal(result.verdict, "scam");

  const [adj] = result.riskAdjustments;
  assert.equal(adj.ruleId, "CW-2");
  assert.equal(adj.evidenceCount, 5);
  const audit = db.prepare("SELECT * FROM risk_audit_log WHERE id = ?").get(adj.auditRef);
  assert.equal(audit.rule_id, "CW-2");
  assert.equal(audit.rules_version, "wave-rules-v1");
  assert.equal(audit.verdict_from, "suspicious");
  assert.equal(audit.verdict_to, "scam");
  assert.equal(JSON.parse(audit.evidence_event_ids).length, 5);
});

test("crowd evidence alone lifts safe only to suspicious", () => {
  reportFrom(5);
  const result = applyCommunityEvidence(llmResult({ verdict: "safe", riskScore: 10 }), SCAM, { now: NOW });
  assert.equal(result.verdict, "suspicious");
  assert.equal(result.riskAdjustments[0].verdictFrom, "safe");
});

test("one IP reporting repeatedly does not create a cluster (anti-poisoning)", () => {
  for (let i = 0; i < 10; i++) recordUserReport({ sender: "57891234", message: SCAM, ip: "6.6.6.6", now: NOW - i * 60_000 });
  const result = applyCommunityEvidence(llmResult(), SCAM, { now: NOW });
  assert.equal(result.riskAdjustments, undefined);
});

test("mass-reported message whose links are all official domains is never boosted", () => {
  const genuine = "MCB: Your statement is ready. View it securely at https://mcb.mu/statements";
  reportFrom(6, { message: genuine, sender: "MCB" });
  const result = applyCommunityEvidence(llmResult({ verdict: "safe" }), genuine, { now: NOW });
  assert.equal(result.verdict, "safe");
  assert.equal(result.riskAdjustments, undefined);
});

test("a message is never evidence for itself: evaluated before its own auto event is recorded", () => {
  const scamResult = () =>
    llmResult({ verdict: "scam", signals: [{ type: "lookalike_url", severity: "high", source: "url_parser" }] });
  for (let i = 0; i < 6; i++) applyCommunityEvidence(scamResult(), SCAM, { ip: `9.9.9.${i}`, now: NOW - i * HOUR });
  // 6 auto events from 6 distinct IPs, but zero human reports -> no boost.
  const result = applyCommunityEvidence(scamResult(), SCAM, { ip: "9.9.9.99", now: NOW });
  assert.equal(result.riskAdjustments, undefined);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM report_events WHERE origin = 'auto_high_confidence'").get().n, 7);
});

test("uncorroborated LLM scam verdicts are not recorded as evidence", () => {
  applyCommunityEvidence(llmResult({ verdict: "scam" }), SCAM, { now: NOW });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM report_events").get().n, 0);
});

test("unknown (failed) analyses are passed through untouched", () => {
  reportFrom(5);
  const failed = { verdict: "unknown", signals: [], analysisFailed: true };
  assert.deepEqual(applyCommunityEvidence({ ...failed }, SCAM, { now: NOW }), failed);
});

test("retention purge deletes expired events and audits only", () => {
  recordUserReport({ sender: "57891234", message: SCAM, ip: "1.1.1.1", now: NOW - 91 * DAY });
  recordUserReport({ sender: "57891234", message: SCAM, ip: "1.1.1.2", now: NOW - DAY });
  const { events } = purgeExpiredCommunityData(NOW);
  assert.equal(events, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM report_events").get().n, 1);
});
