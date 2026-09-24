process.env.DATABASE_URL = ":memory:";
process.env.ORG_PSEUDONYM_SECRET = "test-secret";

import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

const { db } = await import("../../db/index.js");
const {
  evaluateOrgIntel, extractIndicators, listCampaigns, observationId, pseudonym,
  purgeExpiredOrgData, recordOrgEmail, recordOutcome, ORG_RETENTION_DAYS,
} = await import("./index.js");
const { validateEmailContext } = await import("../email-context/index.js");

beforeEach(() => {
  db.exec("DELETE FROM org_outcomes; DELETE FROM org_indicators; DELETE FROM org_email_observations;");
});

const indicator = { key: "sender_domain:asp1re.example", type: "sender_domain", display: "asp1re.example" };

test("five recipients sharing a concrete suspicious indicator cluster; duplicate analysis does not inflate it", () => {
  const orgId = "campaign-test";
  const now = Date.UTC(2026, 8, 23);
  for (let i = 0; i < 4; i++) {
    assert.equal(recordOrgEmail({ orgId, inputHash: `m${i}`, senderKey: "sender", senderDomain: "asp1re.example", recipientKey: `r${i}`, level: "high", flagged: true, indicators: [indicator], now: now + i }), true);
  }
  const evaluated = evaluateOrgIntel({ orgId, inputHash: "m4", indicators: [indicator], senderKey: "sender", senderDomain: "asp1re.example", recipientKey: "r4", flagged: true, now: now + 10 });
  assert.equal(evaluated.campaigns[0].messages, 5);
  assert.equal(evaluated.campaigns[0].recipients, 5);
  assert.ok(evaluated.signals.some((s) => s.code === "ORG-06"));
  assert.equal(recordOrgEmail({ orgId, inputHash: "m4", senderKey: "sender", senderDomain: "asp1re.example", recipientKey: "r4", level: "high", flagged: true, indicators: [indicator], now: now + 10 }), true);
  assert.equal(recordOrgEmail({ orgId, inputHash: "m4", senderKey: "sender", senderDomain: "asp1re.example", recipientKey: "r4", level: "high", flagged: true, indicators: [indicator], now: now + 20 }), false);
  assert.equal(listCampaigns(orgId, now + 30)[0].messages, 5);
});

test("a current message is not admitted to a campaign until independently flagged", () => {
  const orgId = "candidate-test";
  for (let i = 0; i < 2; i++) recordOrgEmail({ orgId, inputHash: `peer${i}`, senderKey: `s${i}`, senderDomain: "bad.example", recipientKey: `r${i}`, level: "high", flagged: true, indicators: [indicator] });
  const clean = evaluateOrgIntel({ orgId, inputHash: "clean", indicators: [indicator], senderKey: "s3", recipientKey: "r3", senderDomain: "bad.example", flagged: false });
  assert.equal(clean.campaigns.length, 0);
  assert.ok(!clean.signals.some((s) => s.code === "ORG-06"));
});

test("claimed organisation text alone is not an indicator or campaign key", () => {
  const parsed = validateEmailContext({ from: "person@one.example", recipient: "a@demo-company.example" }).value;
  const indicators = extractIndicators(parsed, { text: "Aspire quarterly community event invitation" });
  assert.ok(!indicators.some((i) => i.type === "brand" || i.display === "Aspire"));
  assert.ok(indicators.some((i) => i.type === "sender_domain"));
});

test("observation IDs separate recipients but remain stable for an exact re-analysis", () => {
  const orgId = "dedupe-test";
  const inputHash = "content";
  const r1 = pseudonym(orgId, "one@example.com");
  const r2 = pseudonym(orgId, "two@example.com");
  assert.equal(observationId({ orgId, inputHash, messageId: "id-1", recipientKey: r1 }), observationId({ orgId, inputHash, messageId: "id-1", recipientKey: r1 }));
  assert.notEqual(observationId({ orgId, inputHash, messageId: "id-1", recipientKey: r1 }), observationId({ orgId, inputHash, messageId: "id-1", recipientKey: r2 }));
});

test("analyst outcomes are persisted for reputation only; no self-learning occurs", () => {
  const orgId = "outcome-test";
  recordOrgEmail({ orgId, inputHash: "first", senderKey: "same-sender", senderDomain: "bad.example", recipientKey: "r1", level: "high", flagged: true, indicators: [indicator] });
  const outcome = recordOutcome({ orgId, inputHash: "first", analystId: "analyst@example.com", label: "confirmed_bec" });
  assert.equal(outcome.consensus, "confirmed_bec");
  const next = evaluateOrgIntel({ orgId, inputHash: "next", indicators: [indicator], senderKey: "same-sender", senderDomain: "bad.example", recipientKey: "r2", flagged: true });
  assert.ok(next.signals.some((s) => s.code === "ORG-05"));
  assert.equal(recordOutcome({ orgId, inputHash: "first", analystId: "a", label: "auto_retrain" }).error, "invalid_label");
});

test("retention: observations, indicators and their labels older than ORG_RETENTION_DAYS are purged; newer ones stay", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-09-24T00:00:00.000Z");
  const old = "a".repeat(64);
  const recent = "b".repeat(64);
  const base = { orgId: "org", senderKey: "s", senderDomain: "x.example", recipientKey: "r", level: "high", flagged: true, indicators: [indicator] };
  recordOrgEmail({ ...base, inputHash: old, now: now - (ORG_RETENTION_DAYS + 1) * DAY });
  recordOrgEmail({ ...base, inputHash: recent, now: now - (ORG_RETENTION_DAYS - 1) * DAY });
  recordOutcome({ orgId: "org", inputHash: old, analystId: "a1", label: "confirmed_phishing", now });
  recordOutcome({ orgId: "org", inputHash: recent, analystId: "a1", label: "confirmed_phishing", now });

  purgeExpiredOrgData(now);

  const hashes = (table) => db.prepare(`SELECT input_hash FROM ${table} ORDER BY input_hash`).all().map((r) => r.input_hash);
  assert.deepEqual(hashes("org_email_observations"), [recent]);
  assert.deepEqual(hashes("org_indicators"), [recent]);
  assert.deepEqual(hashes("org_outcomes"), [recent], "a label goes with its observation");
});
