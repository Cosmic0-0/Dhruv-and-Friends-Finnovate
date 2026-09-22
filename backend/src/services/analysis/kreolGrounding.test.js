import { test } from "node:test";
import assert from "node:assert/strict";

const { getKreolGrounding } = await import("./kreolGrounding.js");

// Lifted verbatim from data/kreol-dataset/scam-corpus.jsonl (id: FL-KM-0002,
// status: owner_reviewed) - a realistic mfe+en code-switched OTP-theft
// message.
const REALISTIC_KREOL_MESSAGE =
  "Ser client, lekip sekirite IslandTrust Bank pe demann ou konfirm OTP (583291) lor sa nimero-la pou anil enn transaksion sispe.";

test("getKreolGrounding returns relevant examples/terms for a realistic Kreol code-switched message", () => {
  const result = getKreolGrounding(REALISTIC_KREOL_MESSAGE);

  assert.ok(result.examples.length > 0, "expected at least one retrieved corpus example");
  assert.ok(
    result.examples.some((ex) => ex.id === "FL-KM-0002"),
    "expected the near-identical corpus row (FL-KM-0002) to be the/a top match"
  );
  assert.equal(typeof result.promptBlock, "string");
  assert.match(result.promptBlock, /SYNTHETIC/);
  assert.match(result.promptBlock, /583291/);
});

test("getKreolGrounding only returns owner_reviewed/ported_reviewed rows by default - never draft_generated or rejected", () => {
  // A message sharing tokens with reviewed OTP/transaction terminology -
  // confirm no rejected or draft row ever leaks into corpus or term
  // retrieval, whatever the dataset currently holds.
  const message = "Mesaz sispe pe fer OTP kontrol, pou anil transaksion.";
  const result = getKreolGrounding(message);

  for (const term of result.terms) {
    assert.notEqual(term.status, "rejected", `rejected row leaked into terms: ${JSON.stringify(term)}`);
  }
  for (const ex of result.examples) {
    assert.notEqual(ex.status, "rejected", `rejected row leaked into examples: ${JSON.stringify(ex)}`);
    assert.notEqual(ex.status, "draft_generated", `draft row leaked into examples: ${JSON.stringify(ex)}`);
  }
  // includeDraft opts into draft_generated rows too, but rejected rows must
  // remain excluded unconditionally either way.
  const withDraft = getKreolGrounding(message, { includeDraft: true });
  for (const term of withDraft.terms) {
    assert.notEqual(term.status, "rejected");
  }
  for (const ex of withDraft.examples) {
    assert.notEqual(ex.status, "rejected");
  }
});

test("getKreolGrounding degrades gracefully (empty result, no throw) when nothing is relevant", () => {
  const message = "Zzzqx Wvbnm Ptrfgh 999000 unrelated gibberish nonsense";
  const result = getKreolGrounding(message);

  assert.deepEqual(result.examples, []);
  assert.deepEqual(result.terms, []);
  assert.equal(result.promptBlock, undefined);
});

test("getKreolGrounding degrades gracefully on non-string/empty input without throwing", () => {
  assert.doesNotThrow(() => getKreolGrounding(""));
  assert.doesNotThrow(() => getKreolGrounding(null));
  assert.doesNotThrow(() => getKreolGrounding(undefined));
  assert.doesNotThrow(() => getKreolGrounding(12345));

  const result = getKreolGrounding("");
  assert.deepEqual(result.examples, []);
  assert.deepEqual(result.terms, []);
  assert.equal(result.promptBlock, undefined);
});
