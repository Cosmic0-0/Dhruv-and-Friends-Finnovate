import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = ":memory:";
const { db } = await import("../../db/index.js");
const { recordRadarObservation, getRadar, rangeWindows, muDay, purgeExpiredRadarData } = await import("./index.js");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-24T08:00:00Z");

function reset() {
  db.exec("DELETE FROM radar_daily; DELETE FROM radar_domain_daily;");
}

const scam = (extra = {}) => ({
  verdict: "scam",
  scamProfile: { type: "MCB_IMPERSONATION", claimedIdentity: "MCB" },
  signals: [{ type: "lookalike_url", domain: "mcb-secure.top", officialDomain: "mcb.mu" }],
  analysis: { channel: "sms" },
  ...extra,
});

test("empty database returns zeros and empty lists, never invented activity", () => {
  reset();
  const r = getRadar("7d", NOW);
  assert.equal(r.scamsCaught, 0);
  assert.equal(r.flaggedChecks, 0);
  assert.equal(r.change, null);
  assert.equal(r.topImpersonated, null);
  assert.equal(r.rising, null);
  assert.deepEqual(r.topScamTypes, []);
  assert.deepEqual(r.fakeLinks, []);
  assert.equal(r.series.length, 7);
  assert.ok(r.series.every((b) => b.scams === 0));
});

test("safe results are not counted; scam and suspicious are", () => {
  reset();
  assert.equal(recordRadarObservation({ verdict: "safe", signals: [] }, NOW), false);
  recordRadarObservation(scam(), NOW);
  recordRadarObservation(scam({ verdict: "suspicious" }), NOW);
  const r = getRadar("7d", NOW);
  assert.equal(r.scamsCaught, 1);
  assert.equal(r.flaggedChecks, 2);
  assert.equal(r.series.at(-1).scams, 1);
});

test("aggregates impersonated brand, scam types, links and rising type", () => {
  reset();
  // previous 7-day period: one parcel scam
  recordRadarObservation(scam({ scamProfile: { type: "FAKE_PARCEL", claimedIdentity: null }, signals: [] }), NOW - 10 * DAY);
  // current period
  recordRadarObservation(scam(), NOW);
  recordRadarObservation(scam(), NOW - DAY);
  recordRadarObservation(scam({ scamProfile: { type: "FAKE_PARCEL", claimedIdentity: null }, signals: [] }), NOW);
  const r = getRadar("7d", NOW);
  assert.equal(r.scamsCaught, 3);
  assert.deepEqual(r.change, { previous: 1, pct: 200 });
  assert.equal(r.topImpersonated.name, "MCB");
  assert.equal(r.topImpersonated.checks, 2);
  assert.equal(r.topImpersonated.sharePct, 67);
  assert.deepEqual(r.topScamTypes.map((t) => [t.scamType, t.checks, t.pct]), [["MCB_IMPERSONATION", 2, 67], ["FAKE_PARCEL", 1, 33]]);
  assert.equal(r.rising.scamType, "MCB_IMPERSONATION");
  assert.equal(r.rising.previous, 0);
  assert.equal(r.rising.mainChannel, "sms");
  assert.deepEqual(r.fakeLinks, [{ domain: "mcb-secure.top", imitates: "MCB", times: 2 }]);
});

test("stores no message text, sender or placeholders", () => {
  reset();
  recordRadarObservation(
    scam({ scamProfile: { type: "MOBILE_MONEY_FRAUD", claimedIdentity: "[phone]" }, sender: "+230 5789 1234", message: "secret", signals: [] }),
    NOW
  );
  const rows = db.prepare("SELECT * FROM radar_daily").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].claimed_identity, "");
  assert.ok(!JSON.stringify(rows).includes("5789"));
  assert.ok(!JSON.stringify(rows).includes("secret"));
});

test("range windows: 7d/30d daily, 12m monthly; days are Mauritius days", () => {
  assert.equal(muDay(Date.parse("2026-09-24T21:00:00Z")), "2026-09-25");
  assert.equal(rangeWindows("7d", NOW).buckets.length, 7);
  assert.equal(rangeWindows("30d", NOW).buckets.length, 30);
  const m = rangeWindows("12m", NOW);
  assert.equal(m.unit, "month");
  assert.equal(m.buckets.length, 12);
  assert.equal(m.buckets[0].start, "2025-10-01");
  assert.equal(m.buckets.at(-1).start, "2026-09-01");
  assert.throws(() => getRadar("1y", NOW), RangeError);
});

test("12m range sums months", () => {
  reset();
  recordRadarObservation(scam(), NOW - 40 * DAY);
  recordRadarObservation(scam(), NOW);
  const r = getRadar("12m", NOW);
  assert.equal(r.scamsCaught, 2);
  assert.equal(r.series.at(-1).scams, 1);
  assert.equal(r.series.at(-2).scams + r.series.at(-3).scams, 1);
});

test("retention purge removes old rows", () => {
  reset();
  recordRadarObservation(scam(), NOW - 800 * DAY);
  recordRadarObservation(scam(), NOW);
  purgeExpiredRadarData(NOW);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM radar_daily").get().n, 1);
});
