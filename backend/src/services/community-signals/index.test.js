import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = ":memory:";
process.env.REPORTER_HASH_SECRET = "test-secret";

const { db } = await import("../../db/index.js");
const { score } = await import("../risk-engine/index.js");
const { checkUrls } = await import("../domain-matching/index.js");
const { checkIdentityConsistency } = await import("../identity-consistency/index.js");
const { detectLexicon } = await import("../lexicon/index.js");
const {
  evaluateCommunitySignal,
  recordCommunityOutcome,
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

// Runs the same evaluate -> score -> record sequence as services/pipeline.
function analyse(message, { ip = "1.1.1.1", now = NOW, extraSignals = [] } = {}) {
  const community = evaluateCommunitySignal(message, { now });
  const base = [...checkUrls(message), ...checkIdentityConsistency(message), ...detectLexicon(message), ...extraSignals];
  const signals = community.signal ? [...base, community.signal] : base;
  const decision = score(signals, { semanticStatus: "ok" });
  const levelWithoutCommunity = score(base, { semanticStatus: "ok" }).level;
  const outcome = recordCommunityOutcome({ community, signals, decision, levelWithoutCommunity, ip, now });
  return { community, decision, outcome };
}

test("no community evidence -> no signal, no audit row", () => {
  const { community, outcome } = analyse(SCAM);
  assert.equal(community.signal, null);
  assert.equal(outcome.riskAdjustment, undefined);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM risk_audit_log").get().n, 0);
});

test("wave of 5 distinct reporters -> REP-02 registry signal scored by the engine, with a matching audit row", () => {
  reportFrom(5);
  const { community, decision, outcome } = analyse(SCAM.replace("[phone 1]", "[phone 3]"));

  const signal = community.signal;
  assert.equal(signal.code, "REP-02");
  assert.equal(signal.type, "community_wave");
  assert.equal(signal.sourceType, "community");
  assert.equal(signal.source, "community_reports");
  assert.equal(signal.communityEvidence.distinctReporters, 5);
  assert.equal(signal.communityEvidence.rulesVersion, "wave-rules-v2");

  // Points come from the risk engine's ruleset, not from the wave rules.
  assert.equal(decision.trace.find((t) => t.id === "REP-02").points, 20);
  // Wave + a deterministic lookalike (mcb-secure.top) -> critical floor.
  assert.equal(decision.level, "critical");
  assert.ok(decision.trace.some((t) => t.id === "FLOOR-REP02-TECHNICAL"));

  const adj = outcome.riskAdjustment;
  assert.equal(adj.ruleId, "CW-2");
  assert.equal(adj.signalCode, "REP-02");
  assert.equal(adj.evidenceCount, 5);
  assert.equal(adj.levelTo, "critical");
  const audit = db.prepare("SELECT * FROM risk_audit_log WHERE id = ?").get(adj.auditRef);
  assert.equal(audit.rule_id, "CW-2");
  assert.equal(audit.rules_version, "wave-rules-v2+rs-1.2");
  assert.equal(audit.verdict_from, adj.levelFrom);
  assert.equal(audit.verdict_to, "critical");
  assert.equal(JSON.parse(audit.evidence_event_ids).length, 5);
});

test("crowd evidence alone (no technical finding) stays bounded: REP-02 points only, no floor", () => {
  const plain = "Your parcel is waiting, reply YES to arrange delivery of your package from the depot today please";
  reportFrom(5, { message: plain });
  const { decision } = analyse(plain);
  assert.equal(decision.score, 20);
  assert.equal(decision.level, "elevated");
  assert.ok(!decision.trace.some((t) => String(t.id).startsWith("FLOOR")));
});

test("one IP reporting repeatedly does not create a cluster (anti-poisoning)", () => {
  for (let i = 0; i < 10; i++) recordUserReport({ sender: "57891234", message: SCAM, ip: "6.6.6.6", now: NOW - i * 60_000 });
  assert.equal(analyse(SCAM).community.signal, null);
});

test("mass-reported message whose links are all official domains (incl. subdomains) is never boosted", () => {
  const genuine = "MCB: Your statement is ready. View it securely at https://internet.mcb.mu/statements";
  reportFrom(6, { message: genuine, sender: "MCB" });
  const { community, decision } = analyse(genuine);
  assert.equal(community.signal, null);
  assert.equal(decision.level, "low");
});

test("a message is never evidence for itself, and machine events alone never fire a tier", () => {
  for (let i = 0; i < 6; i++) analyse(SCAM, { ip: `9.9.9.${i}`, now: NOW - i * HOUR });
  // 6 corroborated high-level analyses -> 6 auto events, but zero human reports -> no boost.
  const { community } = analyse(SCAM, { ip: "9.9.9.99" });
  assert.equal(community.signal, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM report_events WHERE origin = 'auto_high_confidence'").get().n, 7);
});

test("analyses without a deterministic impersonation finding are not recorded as evidence", () => {
  const noLink = "Your account is suspended, act now or lose access within 24h";
  analyse(noLink);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM report_events").get().n, 0);
});

test("retention purge deletes expired events and audits only", () => {
  recordUserReport({ sender: "57891234", message: SCAM, ip: "1.1.1.1", now: NOW - 91 * DAY });
  recordUserReport({ sender: "57891234", message: SCAM, ip: "1.1.1.2", now: NOW - DAY });
  const { events } = purgeExpiredCommunityData(NOW);
  assert.equal(events, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM report_events").get().n, 1);
});
