import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTemplate, templateHash, simhash, hammingDistance, fingerprintMessage } from "./fingerprint.js";

const BASE =
  "MCB: Your account is suspended. Verify now at https://mcb-secure.top/verify or call [phone 1] within 24h. Rs 5,000 fee.";

test("normalizeTemplate collapses placeholders, URL paths, digits and punctuation", () => {
  assert.equal(
    normalizeTemplate(BASE),
    "mcb your account is suspended verify now at mcb-secure.top or call ph within # h rs # fee"
  );
});

test("normalizeTemplate strips accents so French/Kreol spelling variants align", () => {
  assert.equal(normalizeTemplate("Vérifiez votre compte"), normalizeTemplate("Verifiez votre compte"));
});

test("templateHash is identical for copies differing only in amounts, placeholders and URL paths", () => {
  const variant =
    "MCB: Your account is suspended. Verify now at http://mcb-secure.top/login?x=9 or call [phone 2] within 12h. Rs 12,500 fee.";
  assert.equal(templateHash(BASE), templateHash(variant));
});

test("templateHash differs for a different lookalike host", () => {
  assert.notEqual(templateHash(BASE), templateHash(BASE.replace("mcb-secure.top", "mcb-login.top")));
});

test("simhash keeps a one-word edit within the near-duplicate threshold", () => {
  const edited = BASE.replace("suspended", "blocked");
  assert.ok(hammingDistance(simhash(BASE), simhash(edited)) <= 6);
});

test("simhash keeps unrelated scams far apart", () => {
  const kreolPrize = "Emtel: Felicitations! Ou finn gagn enn iPhone. Klik lor emtel-prize.xyz pou reklam ou kado zordi.";
  assert.ok(hammingDistance(simhash(BASE), simhash(kreolPrize)) > 20);
});

test("hammingDistance counts differing bits", () => {
  assert.equal(hammingDistance("0000000000000000", "0000000000000000"), 0);
  assert.equal(hammingDistance("0000000000000000", "000000000000000f"), 4);
  assert.equal(hammingDistance("ffffffffffffffff", "0000000000000000"), 64);
});

test("fingerprintMessage never includes raw text", () => {
  const fp = fingerprintMessage(BASE);
  assert.deepEqual(Object.keys(fp).sort(), ["simhash", "templateHash", "tokenCount"]);
  assert.match(fp.templateHash, /^[0-9a-f]{16}$/);
  assert.match(fp.simhash, /^[0-9a-f]{16}$/);
});
