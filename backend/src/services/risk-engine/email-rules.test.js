// rs-1.1 email evidence: base weights, one-fact dedupe, EX-* interactions,
// the EX-2 floor and the SOC-07 semantic trust policy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { score, dedupe, RULESET_RS_1_0, RULESET_RS_1_1, RULESET_RS_1_2, ACTIVE_RULESET } from "./index.js";
import { makeSignal } from "../signals/registry.js";

const sig = (code, sourceType = "rule", metadata = {}) => makeSignal(code, { sourceType, metadata });
const email = (code, variant, host) => sig(code, "rule", { ...(variant ? { variant } : {}), ...(host ? { host } : {}) });
const ids = (r) => r.trace.map((t) => t.id);

test("rs-1.2 is active; published rs-1.0 and rs-1.1 remain unchanged and selectable", () => {
  assert.equal(ACTIVE_RULESET.version, "rs-1.2");
  assert.equal(RULESET_RS_1_2.weights["ORG-01"], 30);
  for (const [code, w] of Object.entries(RULESET_RS_1_0.weights)) assert.deepEqual(RULESET_RS_1_1.weights[code], w, code);
  for (const ix of RULESET_RS_1_0.interactions) assert.ok(RULESET_RS_1_1.interactions.includes(ix), ix.id);
  for (const f of RULESET_RS_1_0.floors) assert.ok(RULESET_RS_1_1.floors.includes(f), f.id);
  assert.deepEqual(RULESET_RS_1_1.bands, RULESET_RS_1_0.bands);
  assert.deepEqual(RULESET_RS_1_1.caps, RULESET_RS_1_0.caps);
});

test("rs-1.0 stays selectable and never scores email codes", () => {
  const r = score([email("EMAIL-06")], {}, "rs-1.0");
  assert.equal(r.rulesetVersion, "rs-1.0");
  assert.equal(r.score, 0);
});

test("weak evidence alone stays LOW: Reply-To, auth failure, risky attachment, unfamiliar address, thread newcomer", () => {
  for (const s of [
    email("EMAIL-01"),
    email("EMAIL-03", "dmarc_fail"),
    email("EMAIL-03", "spf_and_dkim_fail"),
    email("EMAIL-03", "dmarc_fail_known_domain"),
    email("EMAIL-05", "risky_type"),
    email("EMAIL-05", "double_extension"),
    email("EMAIL-10"),
    email("EMAIL-04", "different_domain", "x.example"),
  ]) {
    assert.equal(score([s]).level, "low", `${s.code}/${s.metadata.variant}`);
  }
});

test("all weak email signals together still do not reach HIGH without a payment or identity fact", () => {
  const r = score([email("EMAIL-01"), email("EMAIL-03", "dmarc_fail"), email("EMAIL-05", "double_extension"), email("EMAIL-10")]);
  assert.equal(r.score, 8 + 8 + 15 + 8);
  assert.equal(r.level, "elevated");
});

test("variant weights: look-alike supplier domain outweighs an unrelated one", () => {
  assert.equal(score([email("EMAIL-02", "lookalike", "a.example")]).score, 30);
  assert.equal(score([email("EMAIL-02", "unrelated", "b.example")]).score, 20);
  assert.equal(score([email("EMAIL-03", "partial_fail")]).score, 3);
});

test("one look-alike sender domain seen by several email checks and a URL check is ONE finding", () => {
  const host = "abc-suppiies.example";
  const signals = [email("EMAIL-02", "lookalike", host), email("EMAIL-04", "lookalike", host), sig("URL-08", "rule", { host })];
  const findings = dedupe(signals, RULESET_RS_1_1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "EMAIL-02");
  assert.deepEqual(findings[0].corroboratedBy.sort(), ["EMAIL-04", "URL-08"]);
  assert.equal(score(signals).score, 30);
});

test("EMAIL-06 absorbs PAY-07 and EMAIL-07 absorbs PAY-05: one fact scored once", () => {
  const change = score([email("EMAIL-06"), sig("PAY-07", "lexicon")]);
  assert.equal(change.score, 30, "30, not 30 + 20");
  assert.deepEqual(change.findings[0].corroboratedBy, ["PAY-07"]);

  const payee = score([email("EMAIL-07"), sig("PAY-05")]);
  assert.equal(payee.score, 30, "30, not 30 + 25");
  assert.deepEqual(payee.findings[0].corroboratedBy, ["PAY-05"]);
});

test("an absorbed code still counts for existing interactions (IX-3 secrecy + PAY-07 inside EMAIL-06)", () => {
  const r = score([email("EMAIL-06"), sig("PAY-07", "lexicon"), sig("SOC-03", "lexicon")]);
  assert.ok(ids(r).includes("IX-3"));
  assert.equal(r.score, 30 + 15 + 10);
});

test("EX-1: supplier identity mismatch + payment request", () => {
  const r = score([email("EMAIL-02", "unrelated", "x.example"), sig("PAY-01", "lexicon")]);
  assert.deepEqual(ids(r), ["EMAIL-02", "PAY-01", "EX-1"]);
  assert.equal(r.score, 20 + 8 + 15);
});

test("EX-1 / EX-3 / EX-6 share a group: only one applies to one 'wrong sender + payment' story", () => {
  const host = "abc-suppiies.example";
  const r = score([email("EMAIL-02", "lookalike", host), email("EMAIL-04", "lookalike", host), email("EMAIL-06")]);
  const applied = ids(r).filter((id) => ["EX-1", "EX-3", "EX-6"].includes(id));
  assert.deepEqual(applied, ["EX-6"]);
});

test("EX-3: executive impersonation + payment request", () => {
  const r = score([email("EMAIL-09", "directory_name", "gmail.com"), sig("PAY-01", "lexicon")]);
  assert.ok(ids(r).includes("EX-3"));
  assert.equal(r.level, "high");
});

test("EX-4: Reply-To mismatch + credential request; not with a mere payment request", () => {
  assert.ok(ids(score([email("EMAIL-01"), sig("SEC-01", "lexicon")])).includes("EX-4"));
  assert.ok(!ids(score([email("EMAIL-01"), sig("PAY-01", "lexicon")])).includes("EX-4"));
});

test("EX-5 requires DMARC failure on a KNOWN domain, not any auth anomaly", () => {
  assert.ok(ids(score([email("EMAIL-03", "dmarc_fail_known_domain"), sig("PAY-01", "lexicon")])).includes("EX-5"));
  assert.ok(!ids(score([email("EMAIL-03", "dmarc_fail"), sig("PAY-01", "lexicon")])).includes("EX-5"));
  assert.ok(!ids(score([email("EMAIL-03", "partial_fail"), sig("PAY-01", "lexicon")])).includes("EX-5"));
});

test("EX-2 floor: supplier bank change + any sender identity problem is at least HIGH", () => {
  const r = score([email("EMAIL-06"), email("EMAIL-01")]);
  assert.equal(r.level, "high");
  assert.ok(ids(r).includes("FLOOR-EX2-EMAIL06-IDENTITY"));
  assert.equal(score([email("EMAIL-06")]).level, "elevated", "bank change from the real sender alone: verify, not block");
});

test("SOC-07 policy: AI-inferred findings cannot lift the level above non-semantic evidence", () => {
  const signals = [sig("SOC-07", "rule"), sig("SOC-06", "semantic_model"), sig("ID-04", "semantic_model"), sig("SOC-02", "semantic_model")];
  const r = score(signals);
  assert.equal(r.level, "elevated", "25 non-semantic supports elevated; semantic 30 would have made it high");
  assert.equal(r.score, 44);
  assert.ok(ids(r).includes("POLICY-SOC07-SEMANTIC"));
  // Findings stay visible.
  assert.ok(r.findings.some((f) => f.code === "SOC-06"));

  const without = score(signals.slice(1).concat(sig("URL-08", "rule")));
  assert.ok(!ids(without).includes("POLICY-SOC07-SEMANTIC"), "no SOC-07, no restriction");
});

test("SOC-07 policy never lowers what deterministic evidence supports", () => {
  const signals = [sig("SOC-07", "rule"), email("EMAIL-09", "directory_name", "gmail.com"), sig("PAY-01", "lexicon"), sig("SOC-06", "semantic_model")];
  const withSemantic = score(signals);
  const deterministicOnly = score(signals.filter((s) => s.sourceType !== "semantic_model"));
  assert.ok(withSemantic.score >= deterministicOnly.score);
  assert.equal(withSemantic.level, deterministicOnly.level);
});

test("SOC-07 detected only by the model still counts as hostile - its own points are not restricted", () => {
  const r = score([sig("SOC-07", "semantic_model")]);
  assert.equal(r.score, 25);
  assert.ok(!ids(r).includes("POLICY-SOC07-SEMANTIC"));
});
