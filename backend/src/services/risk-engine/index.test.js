import { test } from "node:test";
import assert from "node:assert/strict";
import { score, dedupe, levelForScore, verdictForLevel, RULESET_RS_1_0 } from "./index.js";
import { makeSignal } from "../signals/registry.js";

const sig = (code, sourceType, metadata = {}) => makeSignal(code, { sourceType, metadata });
const MCB = { id: "mcb", display_name: "MCB" };

test("bands and legacy verdict mapping", () => {
  assert.equal(levelForScore(0), "low");
  assert.equal(levelForScore(19), "low");
  assert.equal(levelForScore(20), "elevated");
  assert.equal(levelForScore(44), "elevated");
  assert.equal(levelForScore(45), "high");
  assert.equal(levelForScore(70), "critical");
  assert.equal(verdictForLevel("low"), "safe");
  assert.equal(verdictForLevel("elevated"), "suspicious");
  assert.equal(verdictForLevel("high"), "scam");
  assert.equal(verdictForLevel("critical"), "scam");
});

test("no signals -> low, proceed, score 0", () => {
  const r = score([], { semanticStatus: "ok" });
  assert.equal(r.score, 0);
  assert.equal(r.level, "low");
  assert.equal(r.decision, "proceed");
  assert.equal(r.rulesetVersion, "rs-1.0");
});

test("one suspicious hostname is ONE scored finding, not three full-weight ones", () => {
  const host = { host: "mcb-secure.top" };
  const signals = [sig("URL-02", "rule", host), sig("ID-01", "rule", host), sig("ID-04", "semantic_model")];
  const findings = dedupe(signals);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "URL-02");
  assert.deepEqual(findings[0].corroboratedBy.sort(), ["ID-01", "ID-04"]);

  const r = score(signals, { semanticStatus: "ok" });
  assert.equal(r.score, 30, "30 for the one fact, not 30 + 30 + 12");
  assert.deepEqual(r.trace.map((t) => t.id), ["URL-02"]);
});

test("the same code from lexicon and semantic model scores once, at the verified weight", () => {
  const r = score([sig("SOC-01", "semantic_model"), sig("SOC-01", "lexicon")], { semanticStatus: "ok" });
  assert.equal(r.score, 6);
  assert.deepEqual(r.trace[0].corroboratedBy, ["semantic_model"]);
});

test("semantic-only evidence is capped at 30 -> elevated / verify_first, never do_not_pay", () => {
  const signals = ["SEC-01", "PAY-03", "SOC-03", "SOC-06", "PAY-02", "ID-04"].map((c) => sig(c, "semantic_model"));
  const r = score(signals, { semanticStatus: "ok", claimedInstitution: MCB });
  assert.equal(r.score, RULESET_RS_1_0.caps.semanticOnly);
  assert.equal(r.level, "elevated");
  assert.equal(r.decision, "verify_first");
  assert.equal(r.confidence, "low");
  assert.ok(r.trace.some((t) => t.id === "CAP-SEMANTIC"));
  assert.ok(!r.trace.some((t) => String(t.id).startsWith("FLOOR")), "semantic evidence can never trigger a floor");
});

test("a confirmed malicious technical finding reaches HIGH with no LLM at all", () => {
  const r = score([sig("REP-05", "intel")], { semanticStatus: "unavailable" });
  assert.equal(r.level, "high");
  assert.equal(r.decision, "do_not_pay");
  assert.equal(r.confidence, "high");

  // A confirmed template (40 points = elevated by addition) is lifted by its floor.
  const template = score([sig("REP-04", "intel")], { semanticStatus: "unavailable" });
  assert.equal(template.level, "high");
  assert.ok(template.trace.some((t) => t.id === "FLOOR-REP04-KNOWN-TEMPLATE" && t.levelFloor === "high"));
});

test("floors: safe account, OTP + claimed institution, wave + technical", () => {
  assert.equal(score([sig("PAY-03", "lexicon")]).level, "high");

  const otpNoClaim = score([sig("SEC-01", "lexicon")], { semanticStatus: "ok" });
  assert.equal(otpNoClaim.level, "elevated", "OTP phrase alone without a claimed institution is not floored");
  const otpClaim = score([sig("SEC-01", "lexicon")], { semanticStatus: "ok", claimedInstitution: MCB });
  assert.equal(otpClaim.level, "high");
  assert.equal(otpClaim.score, 45);
  const floor = otpClaim.trace.find((t) => t.id === "FLOOR-SEC01-INSTITUTION");
  assert.equal(floor.levelFloor, "high");
  assert.equal(floor.points, 15);

  const wave = score([sig("REP-02", "community"), sig("URL-02", "rule", { host: "x.top" })]);
  assert.equal(wave.level, "critical");
});

test("interactions apply once each, from a closed set", () => {
  const signals = [sig("URL-02", "rule", { host: "a.top" }), sig("URL-01", "rule", { host: "b.top" }), sig("SEC-01", "lexicon"), sig("PAY-01", "lexicon")];
  const r = score(signals);
  assert.equal(r.trace.filter((t) => t.id === "IX-1").length, 1);
});

test("an interaction between semantic-only findings stays inside the semantic cap", () => {
  const r = score([sig("SOC-06", "semantic_model"), sig("PAY-02", "semantic_model")], { semanticStatus: "ok" });
  assert.ok(r.trace.some((t) => t.id === "IX-5" && t.semanticOnly));
  assert.equal(r.score, 30);
});

test("confidence is separate from risk", () => {
  assert.equal(score([sig("URL-02", "rule", { host: "a.top" })], { semanticStatus: "unavailable" }).confidence, "high");
  assert.equal(score([sig("SOC-01", "lexicon"), sig("SOC-02", "semantic_model")], { semanticStatus: "ok" }).confidence, "moderate");
  assert.equal(score([], { semanticStatus: "unavailable" }).confidence, "low");
  assert.equal(score([sig("URL-02", "rule", { host: "a.top" })], { semanticStatus: "ok", ocrQuality: "low" }).confidence, "moderate");
});

test("score is deterministic and capped at 100", () => {
  const many = ["URL-02", "SEC-01", "SEC-02", "PAY-03", "PAY-06", "REP-05"].map((c, i) => sig(c, c === "REP-05" ? "intel" : "rule", { host: `h${i}.top` }));
  const a = score(many, { claimedInstitution: MCB });
  const b = score(many, { claimedInstitution: MCB });
  assert.deepEqual(a.trace, b.trace);
  assert.equal(a.score, 100);
});

test("unknown ruleset version is rejected", () => {
  assert.throws(() => score([], {}, "rs-9.9"), /unknown ruleset/);
});
