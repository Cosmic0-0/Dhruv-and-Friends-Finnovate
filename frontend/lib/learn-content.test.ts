import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRound, localDay, nextStreak, toQuizItems, trendCards, ROUND_SIZE, type CorpusRow } from "./learn-content.ts";

const row = (over: Partial<CorpusRow>): CorpusRow => ({
  id: "FL-KM-9999",
  original_message: "msg",
  language_mix: "mfe",
  english_meaning: "meaning",
  scam_type: "bank_impersonation",
  risk_signals: [],
  status: "draft_generated",
  ...over,
});

test("risk signals map to result-screen kinds, deduped, most important first", () => {
  const [item] = toQuizItems([
    row({ risk_signals: ["URGENCY", "THREAT", "SUSPICIOUS_URL", "IMPERSONATION", "SENSITIVE_INFO_REQUEST", "MADE_UP"] }),
  ]);
  assert.equal(item.isScam, true);
  assert.deepEqual(item.reasons, ["lookalike_url", "credential_request", "urgency_language", "spoofed_identity"]);
});

test("legitimate rows are genuine with no reasons; rejected and empty rows are dropped", () => {
  const items = toQuizItems([
    row({ id: "a", scam_type: "legitimate", risk_signals: ["URGENCY"] }),
    row({ id: "b", status: "rejected" }),
    row({ id: "c", original_message: "   " }),
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].isScam, false);
  assert.deepEqual(items[0].reasons, []);
});

test("the first round is deterministic, mixes genuine messages in, and spreads scam types", () => {
  const rows = [
    ...["bank_impersonation", "bank_impersonation", "bank_impersonation", "parcel_customs", "investment", "job_scam", "otp_theft"].map(
      (t, i) => row({ id: `S${i}`, scam_type: t }),
    ),
    row({ id: "G1", scam_type: "legitimate" }),
    row({ id: "G2", scam_type: "legitimate" }),
    row({ id: "G3", scam_type: "legitimate" }),
  ];
  const items = toQuizItems(rows);
  const a = buildRound(items);
  const b = buildRound(items);
  assert.deepEqual(a.map((i) => i.id), b.map((i) => i.id));
  assert.equal(a.length, ROUND_SIZE);
  assert.equal(a.filter((i) => !i.isScam).length, 3);
  const bankCount = a.filter((i) => i.scamType === "bank_impersonation").length;
  assert.ok(bankCount <= 1, `expected scam types spread out, got ${bankCount} bank messages`);
  assert.equal(new Set(a.map((i) => i.id)).size, a.length, "no repeats");
});

test("a reshuffled round has the same mix and no repeats", () => {
  let seed = 42;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const items = toQuizItems([
    ...Array.from({ length: 10 }, (_, i) => row({ id: `S${i}`, scam_type: `t${i % 4}` })),
    ...Array.from({ length: 3 }, (_, i) => row({ id: `G${i}`, scam_type: "legitimate" })),
  ]);
  const r = buildRound(items, random);
  assert.equal(r.length, ROUND_SIZE);
  assert.equal(r.filter((i) => !i.isScam).length, 3);
  assert.equal(new Set(r.map((i) => i.id)).size, r.length);
});

test("small datasets give a shorter round instead of failing", () => {
  const r = buildRound(toQuizItems([row({ id: "S1" }), row({ id: "G1", scam_type: "legitimate" })]));
  assert.equal(r.length, 2);
});

test("trend cards take examples from matching corpus rows, and omit the example if none exists", () => {
  const items = toQuizItems([
    row({ id: "FL-KM-0015", scam_type: "parcel_customs", original_message: "Colis..." }),
    row({ id: "X", scam_type: "family_impersonation", original_message: "Mama..." }),
  ]);
  assert.deepEqual(trendCards(items), [
    { category: "parcel_fee", example: { id: "FL-KM-0015", text: "Colis..." } },
    { category: "fake_relative", example: { id: "X", text: "Mama..." } },
    { category: "investment" },
  ]);
});

test("streak: same day unchanged, next day +1, a gap resets to 1", () => {
  assert.equal(nextStreak({ streak: 0, lastDay: null }, "2026-09-22"), 1);
  assert.equal(nextStreak({ streak: 3, lastDay: "2026-09-22" }, "2026-09-22"), 3);
  assert.equal(nextStreak({ streak: 3, lastDay: "2026-09-21" }, "2026-09-22"), 4);
  assert.equal(nextStreak({ streak: 3, lastDay: "2026-09-19" }, "2026-09-22"), 1);
  assert.equal(nextStreak({ streak: 5, lastDay: "2026-02-28" }, "2026-03-01"), 6);
  assert.equal(nextStreak({ streak: 5, lastDay: "garbage" }, "2026-09-22"), 1);
  assert.match(localDay(new Date(2026, 8, 2)), /^2026-09-02$/);
});

test("the real Kreol corpus loads into a playable round", () => {
  const raw = readFileSync(new URL("../../data/kreol-dataset/scam-corpus.jsonl", import.meta.url), "utf8");
  const items = toQuizItems(raw.trim().split(/\r?\n/).map((l) => JSON.parse(l)));
  assert.ok(items.length >= ROUND_SIZE);
  const round = buildRound(items);
  assert.equal(round.length, ROUND_SIZE);
  assert.ok(round.some((i) => !i.isScam) && round.some((i) => i.isScam));
  for (const i of round.filter((x) => x.isScam)) assert.ok(i.reasons.length > 0, `${i.id} has no mapped reasons`);
  assert.ok(trendCards(items).every((t) => t.example), "every trend card has a corpus example");
});
