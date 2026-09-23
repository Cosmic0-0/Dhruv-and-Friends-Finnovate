import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WAVE_RULES_V1 as RULES,
  matchReasons,
  computeMetrics,
  selectTier,
  evaluateCommunityEvidence,
  buildCommunitySignal,
  hasDeterministicHighSignal,
} from "./wave.js";

const NOW = Date.parse("2026-09-23T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const CANDIDATE = {
  templateHash: "aaaaaaaaaaaaaaaa",
  simhash: "0000000000000000",
  tokenCount: 18,
  lookalikeHosts: ["mcb-secure.top"],
  senderKey: null,
};

let nextId = 1;
function event({ ageMs, reporter, origin = "user_report", ...overrides }) {
  return {
    id: nextId++,
    createdAt: new Date(NOW - ageMs).toISOString(),
    origin,
    reporterHash: reporter,
    templateHash: CANDIDATE.templateHash,
    simhash: CANDIDATE.simhash,
    tokenCount: 18,
    lookalikeHosts: [],
    senderKey: null,
    ...overrides,
  };
}

test("matchReasons: exact template", () => {
  assert.deepEqual(matchReasons(CANDIDATE, event({ ageMs: 0, reporter: "r1" })), ["template"]);
});

test("matchReasons: near-duplicate simhash within threshold, not beyond", () => {
  const near = event({ ageMs: 0, reporter: "r1", templateHash: "b", simhash: "000000000000003f" }); // 6 bits
  const far = event({ ageMs: 0, reporter: "r1", templateHash: "b", simhash: "000000000000007f" }); // 7 bits
  assert.deepEqual(matchReasons(CANDIDATE, near), ["near_duplicate"]);
  assert.deepEqual(matchReasons(CANDIDATE, far), []);
});

test("matchReasons: simhash ignored for too-short templates", () => {
  const short = event({ ageMs: 0, reporter: "r1", templateHash: "b", tokenCount: 3 });
  assert.deepEqual(matchReasons(CANDIDATE, short), []);
});

test("matchReasons: shared lookalike host and sender key", () => {
  const e = event({ ageMs: 0, reporter: "r1", templateHash: "b", simhash: "ffffffffffffffff", lookalikeHosts: ["mcb-secure.top"], senderKey: "23057891234" });
  assert.deepEqual(matchReasons({ ...CANDIDATE, senderKey: "23057891234" }, e), ["lookalike_host", "sender"]);
});

test("matchReasons: a null sender key never matches another null", () => {
  const e = event({ ageMs: 0, reporter: "r1", templateHash: "b", simhash: "ffffffffffffffff" });
  assert.deepEqual(matchReasons(CANDIDATE, e), []);
});

test("computeMetrics counts DISTINCT reporters, not raw events", () => {
  const events = [1, 2, 3, 4, 5].map((i) => event({ ageMs: i * HOUR, reporter: "same-ip" }));
  const m = computeMetrics(events, NOW);
  assert.equal(m.matchedEvents, 5);
  assert.equal(m.distinctReporters, 1);
});

test("computeMetrics excludes events outside the 7-day lookback and in the future", () => {
  const events = [
    event({ ageMs: 8 * DAY, reporter: "old" }),
    event({ ageMs: -HOUR, reporter: "future" }),
    event({ ageMs: HOUR, reporter: "fresh" }),
  ];
  const m = computeMetrics(events, NOW);
  assert.equal(m.distinctReporters, 1);
  assert.deepEqual(m.evidenceIds.length, 1);
});

test("computeMetrics: burst ratio against a quiet baseline uses the 0.5/day floor", () => {
  const events = [1, 2, 3, 4, 5].map((i) => event({ ageMs: i * HOUR, reporter: `r${i}` }));
  const m = computeMetrics(events, NOW);
  assert.equal(m.weight24h, 5);
  assert.equal(m.baselinePerDay, 0.5);
  assert.equal(m.burstRatio, 10);
});

test("computeMetrics: a steady baseline suppresses the burst ratio", () => {
  // 28 events, one every 12h, all inside the (24h, 15d] baseline window -> 2/day.
  const baseline = Array.from({ length: 28 }, (_, i) => event({ ageMs: 30 * HOUR + i * 12 * HOUR, reporter: `b${i}` }));
  const burst = [1, 2, 3, 4, 5].map((i) => event({ ageMs: i * HOUR, reporter: `r${i}` }));
  const m = computeMetrics([...baseline, ...burst], NOW);
  assert.equal(m.baselinePerDay, 2);
  assert.equal(m.burstRatio, 2.5);
});

test("selectTier: below cluster thresholds -> null", () => {
  const events = [1, 2].map((i) => event({ ageMs: i * HOUR, reporter: `r${i}` }));
  assert.equal(selectTier(computeMetrics(events, NOW)), null);
});

test("selectTier: machine-only evidence never fires (feedback-loop guard)", () => {
  const events = Array.from({ length: 10 }, (_, i) =>
    event({ ageMs: i * HOUR, reporter: `r${i}`, origin: "auto_high_confidence" })
  );
  assert.equal(selectTier(computeMetrics(events, NOW)), null);
});

test("selectTier: 3 distinct reporters incl. a human -> CW-1 cluster", () => {
  const events = [1, 2, 3].map((i) => event({ ageMs: i * HOUR, reporter: `r${i}` }));
  assert.equal(selectTier(computeMetrics(events, NOW)).ruleId, "CW-1");
});

test("selectTier: 5 distinct reporters in 24h over a quiet baseline -> CW-2 wave", () => {
  const events = [1, 2, 3, 4, 5].map((i) => event({ ageMs: i * HOUR, reporter: `r${i}` }));
  assert.equal(selectTier(computeMetrics(events, NOW)).ruleId, "CW-2");
});

test("selectTier: many reporters but no burst over baseline -> cluster, not wave", () => {
  const baseline = Array.from({ length: 28 }, (_, i) => event({ ageMs: 2 * DAY + i * 4 * HOUR, reporter: `b${i}` }));
  const burst = [1, 2, 3, 4, 5].map((i) => event({ ageMs: i * HOUR, reporter: `r${i}` }));
  assert.equal(selectTier(computeMetrics([...baseline, ...burst], NOW)).ruleId, "CW-1");
});

test("evaluateCommunityEvidence ignores non-matching events", () => {
  const unrelated = [1, 2, 3, 4, 5].map((i) =>
    event({ ageMs: i * HOUR, reporter: `r${i}`, templateHash: "z", simhash: "ffffffffffffffff" })
  );
  assert.equal(evaluateCommunityEvidence(CANDIDATE, unrelated, NOW), null);
});

test("buildCommunitySignal emits registry-code fields and evidence, with no score arithmetic", () => {
  const events = [1, 2, 3, 4, 5].map((i) => event({ ageMs: i * HOUR, reporter: `r${i}` }));
  const evaluation = evaluateCommunityEvidence(CANDIDATE, events, NOW);
  const built = buildCommunitySignal(evaluation);

  assert.equal(built.code, "REP-02");
  assert.equal(built.communityEvidence.ruleId, "CW-2");
  assert.equal(built.communityEvidence.rulesVersion, "wave-rules-v2");
  assert.equal(built.communityEvidence.distinctReporters, 5);
  assert.deepEqual(built.communityEvidence.matchedBy, { template: 5 });
  assert.equal(built.evidenceEventIds.length, 5);
  assert.equal("riskDelta" in built, false);
  assert.equal("adjustedRiskScore" in built, false);
});

test("a cluster (not a wave) maps to REP-01", () => {
  const events = [1, 2, 3].map((i) => event({ ageMs: i * DAY, reporter: `r${i}` }));
  const evaluation = evaluateCommunityEvidence(CANDIDATE, events, NOW);
  assert.equal(buildCommunitySignal(evaluation).code, "REP-01");
});

test("wave-rules-v1 is kept unchanged so old audit rows stay explainable", () => {
  assert.equal(RULES.version, "wave-rules-v1");
  assert.equal(RULES.wave.riskDelta, 20);
});

test("only rule-sourced impersonation findings count as deterministic corroboration", () => {
  assert.equal(hasDeterministicHighSignal([{ code: "URL-02", sourceType: "rule" }]), true);
  assert.equal(hasDeterministicHighSignal([{ code: "ID-04", sourceType: "semantic_model" }]), false);
  assert.equal(hasDeterministicHighSignal([{ code: "SEC-01", sourceType: "lexicon" }]), false);
});
