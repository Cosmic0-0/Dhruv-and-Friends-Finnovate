// Behaviour of the check-result translation side channel. The provider is a stub,
// so these tests prove the routing and the safety envelope (direction choice,
// caller-token integrity, no unvalidated text), not how good any model's Kreol is.

process.env.DATABASE_URL = ":memory:";

import { test } from "node:test";
import assert from "node:assert/strict";

import { translateMessage } from "./messageTranslation.js";

const EN = "Your account will be blocked today. Do not share your OTP. Visit https://example.test/x or call <PRIV_1> now.";
const KREOL_OUT = "Ou kont pou bloke zordi. Pa partaz ou OTP. Al lor <URL_1> ouswa apel <PRIV_1> aster.";
const KREOL_IN = "Ou kont pou bloke zordi. Pa partaz ou kod OTP ar personn. Apel labank aster pou konfirm.";

const stub = (translation) => async () => JSON.stringify({ translation });
const calls = [];
const recording = (translation) => async (req) => {
  calls.push(req.direction);
  return JSON.stringify({ translation });
};

test("English message to Kreol: restores the link and keeps the redaction token", async () => {
  const r = await translateMessage(EN, "mfe", { provider: stub(KREOL_OUT) });
  assert.equal(r.status, "ok");
  assert.equal(r.source, "en");
  assert.match(r.text, /https:\/\/example\.test\/x/);
  assert.match(r.text, /<PRIV_1>/);
  assert.equal(r.machineTranslated, true);
  assert.equal(r.reviewed, false);
});

test("a dropped redaction token is rejected, never returned", async () => {
  const r = await translateMessage(EN, "mfe", { provider: stub(KREOL_OUT.replace(" apel <PRIV_1>", "")) });
  assert.equal(r.status, "rejected");
  assert.equal(r.text, null);
  assert.ok(r.problems.length > 0);
});

test("an invented or duplicated redaction token is rejected", async () => {
  for (const bad of [`${KREOL_OUT} <PRIV_2>`, `${KREOL_OUT} <PRIV_1>`]) {
    const r = await translateMessage(EN, "mfe", { provider: stub(bad) });
    assert.equal(r.status, "rejected", bad);
    assert.equal(r.text, null);
  }
});

test("a redaction token is restored to the exact value the caller sent, even if it was not number 1", async () => {
  const en = "Your account will be blocked today. Do not share your OTP. Call <PRIV_7> now.";
  const kreol = "Ou kont pou bloke zordi. Pa partaz ou OTP. Apel <PRIV_1> aster.";
  const r = await translateMessage(en, "mfe", { provider: stub(kreol) });
  assert.equal(r.status, "ok");
  assert.match(r.text, /<PRIV_7>/);
  assert.doesNotMatch(r.text, /<PRIV_1>/);
});

test("a copied template tag like <text> is rejected, and the retry can recover", async () => {
  const plain = "Ou kont pou bloke zordi. Pa partaz ou OTP. Al lor <URL_1> ouswa apel <PRIV_1> aster.";
  const stuck = await translateMessage(EN, "mfe", { provider: stub(`<text>${plain}`) });
  assert.equal(stuck.status, "rejected");
  assert.equal(stuck.text, null);
  assert.ok(stuck.problems.includes("stray_markup"));

  const answers = [`<text>${plain}`, plain];
  const recovering = await translateMessage(EN, "mfe", { provider: async () => JSON.stringify({ translation: answers.shift() }) });
  assert.equal(recovering.status, "ok");
  assert.doesNotMatch(recovering.text, /<text>/);
});

test("Kreol message to English uses the mfe-en direction and keeps negation", async () => {
  calls.length = 0;
  const provider = recording("Your account will be blocked today. Do not share your OTP code with anyone. Call the bank now to confirm.");
  const r = await translateMessage(KREOL_IN, "en", { provider });
  assert.equal(r.status, "ok");
  assert.equal(r.source, "mfe");
  assert.deepEqual(calls, ["mfe-en"]);
});

test("a model that drops the negation is rejected", async () => {
  const r = await translateMessage(KREOL_IN, "en", { provider: stub("Your account will be blocked today. Share your OTP code with anyone. Call the bank now to confirm.") });
  assert.equal(r.status, "rejected");
  assert.equal(r.text, null);
  assert.ok(r.problems.includes("negation_mismatch"));
});

test("a message already in the wanted language is not sent to the model", async () => {
  calls.length = 0;
  const r = await translateMessage(KREOL_IN, "mfe", { provider: recording("unused") });
  assert.equal(r.status, "same_language");
  assert.deepEqual(calls, []);
});

test("English to French is not a supported pair", async () => {
  calls.length = 0;
  const r = await translateMessage(EN, "fr", { provider: recording("unused") });
  assert.equal(r.status, "unsupported");
  assert.deepEqual(calls, []);
});

test("text with no language markers is reported as undetermined, not guessed", async () => {
  calls.length = 0;
  const r = await translateMessage("xyzzy plugh 1234", "mfe", { provider: recording("unused") });
  assert.equal(r.status, "undetermined");
  assert.deepEqual(calls, []);
});

test("no provider or a failing provider reports unavailable", async () => {
  assert.equal((await translateMessage(EN, "mfe")).status, "unavailable");
  const failing = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
  };
  const r = await translateMessage(EN, "mfe", { provider: failing });
  assert.equal(r.status, "unavailable");
  assert.equal(r.text, null);
  assert.deepEqual(r.problems, []); // no provider detail leaks to the client
});

test("an unknown target or empty text is unsupported", async () => {
  assert.equal((await translateMessage(EN, "de", { provider: stub("x") })).status, "unsupported");
  assert.equal((await translateMessage("   ", "mfe", { provider: stub("x") })).status, "unsupported");
});
