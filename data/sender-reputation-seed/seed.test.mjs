// Run from the repo root: node --test data/sender-reputation-seed/seed.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.DATABASE_URL = ":memory:";
const store = await import("../../backend/src/db/index.js");
const { readSeed, applySeed } = await import("./load.mjs");

const seed = readSeed();

// Must match VALID_SCAM_TYPES in data/kreol-dataset/scripts/corpus_tool.py.
const SCAM_TYPES = new Set([
  "bank_impersonation", "government_impersonation", "otp_theft", "account_verification",
  "payment_request", "refund_scam", "parcel_customs", "family_impersonation", "changed_number",
  "investment", "job_scam", "prize_lottery", "phishing", "merchant_payment_change", "other",
]);

const payloadIds = new Set(
  [
    ...JSON.parse(readFileSync(new URL("../test-payloads/en.json", import.meta.url), "utf8")),
    ...JSON.parse(readFileSync(new URL("../test-payloads/fr.json", import.meta.url), "utf8")),
    ...readFileSync(new URL("../kreol-dataset/scam-corpus.jsonl", import.meta.url), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  ].map((p) => p.id)
);

test("every entry is well-formed", () => {
  for (const e of seed) {
    assert.match(e.sender, /^\+230 5\d{3} \d{4}$/, e.sender);
    assert.ok(Number.isInteger(e.reportCount) && e.reportCount > 0, e.sender);
    assert.ok(SCAM_TYPES.has(e.scamType), `${e.sender}: ${e.scamType}`);
    for (const id of e.relatedPayloads) assert.ok(payloadIds.has(id), `${e.sender}: unknown payload ${id}`);
  }
});

test("each demo message contains its own number, so the analysis can pick it out", () => {
  for (const e of seed) {
    const local = e.sender.replace("+230 ", "");
    assert.ok(e.demoMessage.includes(local), `${e.sender} missing from its demoMessage`);
  }
});

test("loading sets every count exactly, and loading again changes nothing", () => {
  const first = applySeed(seed, store, { reset: true });
  const second = applySeed(seed, store);
  for (const [i, e] of seed.entries()) {
    assert.equal(first[i].reportCount, e.reportCount, e.sender);
    assert.equal(second[i].reportCount, e.reportCount, e.sender);
    // Other formats of the same number hit the same row.
    assert.equal(store.getReportCount(e.sender.replace(/\D/g, "")), e.reportCount, e.sender);
    assert.equal(store.getReportCount(e.sender.replace("+230 ", "").replace(" ", "")), e.reportCount, e.sender);
  }
});

test("--reset clears live reports back to the seeded counts", () => {
  applySeed(seed, store, { reset: true });
  store.reportSender(seed[0].sender);
  store.reportSender("+230 5123 9999");
  applySeed(seed, store, { reset: true });
  assert.equal(store.getReportCount(seed[0].sender), seed[0].reportCount);
  assert.equal(store.getReportCount("+230 5123 9999"), 0);
});
