import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRound,
  itemsInLanguage,
  languagePool,
  localDay,
  MIN_LANGUAGE_ITEMS,
  nextStreak,
  quizLanguageOf,
  toQuizItems,
  trendCards,
  ROUND_SIZE,
  type CorpusRow,
} from "./learn-content.ts";

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
  const a = buildRound(items, "kreol");
  const b = buildRound(items, "kreol");
  assert.deepEqual(a.map((i) => i.id), b.map((i) => i.id));
  assert.equal(a.length, ROUND_SIZE);
  assert.equal(a.filter((i) => !i.isScam).length, 2);
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
  const r = buildRound(items, "kreol", random);
  assert.equal(r.length, ROUND_SIZE);
  assert.equal(r.filter((i) => !i.isScam).length, 2);
  assert.equal(new Set(r.map((i) => i.id)).size, r.length);
});

test("small datasets give a shorter round instead of failing", () => {
  const r = buildRound(toQuizItems([row({ id: "S1" }), row({ id: "G1", scam_type: "legitimate" })]), "kreol");
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
  const round = buildRound(items, "kreol");
  assert.equal(round.length, ROUND_SIZE);
  assert.ok(round.some((i) => !i.isScam) && round.some((i) => i.isScam));
  for (const i of round.filter((x) => x.isScam)) assert.ok(i.reasons.length > 0, `${i.id} has no mapped reasons`);
  assert.ok(trendCards(items).every((t) => t.example), "every trend card has a corpus example");
});

test("corpus rows map to quiz languages; code-switched rows count as Kreol", () => {
  assert.equal(quizLanguageOf("en"), "en");
  assert.equal(quizLanguageOf("fr"), "fr");
  assert.equal(quizLanguageOf("mfe"), "kreol");
  assert.equal(quizLanguageOf("mfe+en"), "kreol");
  assert.equal(quizLanguageOf("mfe+en+fr"), "kreol");
  assert.equal(quizLanguageOf("de"), null);
});

test("a round only ever contains the selected language, shortened rather than padded", () => {
  const items = toQuizItems([
    ...Array.from({ length: 10 }, (_, i) => row({ id: `K${i}`, language_mix: i % 2 ? "mfe" : "mfe+en" })),
    ...Array.from({ length: 4 }, (_, i) => row({ id: `E${i}`, language_mix: "en", scam_type: i < 1 ? "legitimate" : "bank_impersonation" })),
  ]);
  const en = buildRound(items, "en");
  assert.equal(en.length, 4, "only 4 English items exist: a shorter round, not padded");
  assert.ok(en.every((i) => i.languageMix === "en"));
  assert.ok(buildRound(items, "kreol").every((i) => i.languageMix.startsWith("mfe")));
  assert.equal(buildRound(items, "fr").length, 0);
});

test("the first round is deterministic per language", () => {
  const items = toQuizItems([
    ...Array.from({ length: 6 }, (_, i) => row({ id: `K${i}`, scam_type: `t${i}` })),
    ...Array.from({ length: 6 }, (_, i) => row({ id: `E${i}`, language_mix: "en", scam_type: i < 2 ? "legitimate" : `t${i}` })),
  ]);
  for (const lang of ["en", "kreol"] as const) {
    assert.deepEqual(buildRound(items, lang).map((i) => i.id), buildRound(items, lang).map((i) => i.id));
  }
  assert.notDeepEqual(buildRound(items, "en")[0].id, buildRound(items, "kreol")[0].id);
});

test("a language under the minimum gets an offer, English first when English has enough", () => {
  const items = toQuizItems([
    ...Array.from({ length: 9 }, (_, i) => row({ id: `K${i}` })),
    ...Array.from({ length: 4 }, (_, i) => row({ id: `E${i}`, language_mix: "en" })),
    row({ id: "F1", language_mix: "fr" }),
  ]);
  assert.equal(MIN_LANGUAGE_ITEMS, 4);
  assert.deepEqual(
    { enough: languagePool(items, "en").enough, n: languagePool(items, "en").items.length },
    { enough: true, n: 4 },
  );
  const fr = languagePool(items, "fr");
  assert.equal(fr.enough, false);
  assert.equal(fr.fallback, "en", "English is offered when it has enough, even though Kreol is larger");
});

test("with the real corpus: every language is playable on its own", () => {
  const raw = readFileSync(new URL("../../data/kreol-dataset/scam-corpus.jsonl", import.meta.url), "utf8");
  const items = toQuizItems(raw.trim().split(/\r?\n/).map((l) => JSON.parse(l)));
  // Since the 10 English and 10 French rows landed in the corpus, each language
  // has its own round; the short-set offer is covered by the test above.
  for (const lang of ["kreol", "en", "fr"] as const) {
    const pool = languagePool(items, lang);
    assert.equal(pool.enough, true, `${lang} has only ${pool.items.length} items`);
    assert.equal(pool.fallback, undefined, "a language with enough items needs no offer");
  }
  assert.ok(itemsInLanguage(items, "en").every((i) => i.languageMix === "en"));
});
