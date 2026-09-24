import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getCertificateFacts, certificateSignals, _resetCertificateCache } from "./certificate.js";
import { certificateIdentity } from "../site-security/tls.js";

beforeEach(() => _resetCertificateCache());

const NOW = Date.parse("2026-09-23T12:00:00Z");
const days = (n) => new Date(NOW + n * 86_400_000).toISOString();
const probe = (over = {}) => async () => ({
  ok: true, authorized: true, validFrom: days(-200), validTo: days(100),
  validation: "EV", organization: "The Mauritius Commercial Bank Ltd", issuer: "DigiCert Inc", selfSigned: false, coversHost: true, ...over,
});

test("certificateIdentity: EV, OV and DV, plus host coverage including wildcards", () => {
  const ev = certificateIdentity({ subject: { O: "MCB Ltd", CN: "mcb.mu", businessCategory: "Private Organization", jurisdictionC: "MU" }, issuer: { O: "DigiCert Inc" }, subjectaltname: "DNS:mcb.mu, DNS:www.mcb.mu" }, "www.mcb.mu");
  assert.equal(ev.validation, "EV");
  assert.equal(ev.organization, "MCB Ltd");
  assert.equal(ev.coversHost, true);
  const ov = certificateIdentity({ subject: { O: "Example Ltd", CN: "*.example.com" }, issuer: { O: "Sectigo" }, subjectaltname: "DNS:*.example.com" }, "a.example.com");
  assert.equal(ov.validation, "OV");
  assert.equal(ov.coversHost, true);
  assert.equal(certificateIdentity({ subject: { CN: "*.example.com" }, issuer: { O: "LE" }, subjectaltname: "DNS:*.example.com" }, "b.a.example.com").coversHost, false, "wildcards cover one label");
  const dv = certificateIdentity({ subject: { CN: "x.top" }, issuer: { O: "Let's Encrypt" }, subjectaltname: "DNS:x.top" }, "x.top");
  assert.equal(dv.validation, "DV");
  assert.equal(certificateIdentity({ subject: { CN: "x" }, issuer: { CN: "x" } }, "x").selfSigned, true);
});

test("facts for a healthy EV certificate, no signals", async () => {
  const facts = await getCertificateFacts("www.mcb.mu", { probe: probe(), now: () => NOW });
  assert.deepEqual(
    { validation: facts.validation, organization: facts.organization, trusted: facts.trusted, problem: facts.problem, issuedDaysAgo: facts.issuedDaysAgo, expiresInDays: facts.expiresInDays },
    { validation: "EV", organization: "The Mauritius Commercial Bank Ltd", trusted: true, problem: null, issuedDaysAgo: 200, expiresInDays: 100 }
  );
  assert.deepEqual(certificateSignals("www.mcb.mu", facts, { isLookalike: false }), []);
});

test("an invalid certificate is CERT-01 with the specific problem", async () => {
  for (const [over, problem] of [
    [{ validTo: days(-3), authorized: false }, "expired"],
    [{ selfSigned: true, authorized: false }, "self_signed"],
    [{ coversHost: false }, "wrong_host"],
    [{ authorized: false }, "untrusted"],
  ]) {
    _resetCertificateCache();
    const facts = await getCertificateFacts("bad.example", { probe: probe(over), now: () => NOW });
    assert.equal(facts.problem, problem, problem);
    const [s] = certificateSignals("bad.example", facts, { isLookalike: false });
    assert.equal(s.code, "CERT-01", problem);
  }
});

test("a lookalike with a certificate issued days ago is CERT-02; an ordinary new certificate is not", async () => {
  const facts = await getCertificateFacts("mcb-secure.top", { probe: probe({ validFrom: days(-2), validation: "DV", organization: undefined }), now: () => NOW });
  assert.deepEqual(certificateSignals("mcb-secure.top", facts, { isLookalike: true }).map((s) => s.code), ["CERT-02"]);
  assert.deepEqual(certificateSignals("mcb-secure.top", facts, { isLookalike: false }), [], "renewals are routine: never on its own");
});

test("unreachable or plain-HTTP sites give null facts, and results are cached", async () => {
  let calls = 0;
  const failing = async () => (calls++, { ok: false, error: "timeout" });
  assert.equal(await getCertificateFacts("down.example", { probe: failing, now: () => NOW }), null);
  await getCertificateFacts("down.example", { probe: failing, now: () => NOW });
  assert.equal(calls, 1);
  assert.equal(await getCertificateFacts("x.example", { probe: async () => { throw new Error("unsafe"); }, now: () => NOW }), null);
});

test("a missing intermediate certificate (browsers accept it) is not reported as untrusted", async () => {
  const facts = await getCertificateFacts("incomplete.example", { probe: probe({ authorized: false, authorizationCode: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }), now: () => NOW });
  assert.equal(facts.problem, null);
});
