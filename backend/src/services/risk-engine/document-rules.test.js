// rs-1.4 document-forensics evidence: weights, DX-1, the variant-aware
// forged-institution floor, and proof that the published rulesets did not move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { score, ACTIVE_RULESET, RULESET_RS_1_0, RULESET_RS_1_1, RULESET_RS_1_2, RULESET_RS_1_3 } from "./index.js";
import { makeSignal } from "../signals/registry.js";

const doc = (code, variant) => makeSignal(code, { sourceType: "rule", metadata: variant ? { variant } : {} });
const lex = (code) => makeSignal(code, { sourceType: "lexicon", evidence: "x" });
const sem = (code) => makeSignal(code, { sourceType: "semantic_model", evidence: "x" });
const MCB = { display_name: "MCB" };
const ids = (r) => r.trace.map((t) => t.id);

// Frozen-content fingerprints of the published rulesets - identical to the
// values computed from the commit before rs-1.4 was added. A change here
// means a published ruleset was edited in place.
const fingerprint = (rs) => createHash("sha256").update(JSON.stringify(rs)).digest("hex").slice(0, 16);
const PUBLISHED = {
  "rs-1.0": [RULESET_RS_1_0, "63af4a4eccf19585"],
  "rs-1.1": [RULESET_RS_1_1, "710c598ac72c37c2"],
  "rs-1.2": [RULESET_RS_1_2, "c1ba008158bd778c"],
  "rs-1.3": [RULESET_RS_1_3, "90219063951955de"],
};

test("rs-1.5 is active and the published rulesets are unchanged", () => {
  assert.equal(ACTIVE_RULESET.version, "rs-1.5");
  for (const [version, [rs, expected]] of Object.entries(PUBLISHED)) {
    assert.equal(fingerprint(rs), expected, `${version} was edited in place`);
    assert.ok(!Object.keys(rs.weights).some((c) => c.startsWith("DOC-")), version);
  }
  for (const [code, w] of Object.entries(RULESET_RS_1_3.weights)) assert.deepEqual(ACTIVE_RULESET.weights[code], w, code);
  for (const f of RULESET_RS_1_3.floors) assert.ok(ACTIVE_RULESET.floors.includes(f), f.id);
});

test("older rulesets never score document evidence", () => {
  const r = score([doc("DOC-04", "transparent_overlay"), doc("DOC-05")], { claimedInstitution: MCB }, "rs-1.3");
  assert.equal(r.score, 0);
  assert.equal(r.level, "low");
});

test("each weak document signal alone stays LOW (<20)", () => {
  for (const s of [
    doc("DOC-01"), doc("DOC-02", "incremental_update"), doc("DOC-03", "producer_mismatch"), doc("DOC-04", "overlay"),
    doc("DOC-04", "docx_transparent_image"), doc("DOC-06", "invisible_render_mode"), doc("DOC-07", "embedded_file"),
    doc("DOC-07", "submit_form"), doc("DOC-07", "ole_object"), doc("DOC-08"),
  ]) {
    const r = score([s]);
    assert.ok(r.score < 20, `${s.code}:${s.metadata.variant} scored ${r.score}`);
    assert.equal(r.level, "low");
  }
});

test("medium document signals alone reach ELEVATED, never HIGH", () => {
  for (const s of [
    doc("DOC-04", "transparent_overlay"), doc("DOC-04", "resolution_mismatch"), doc("DOC-05"), doc("DOC-02", "after_signature"),
    doc("DOC-07", "javascript"), doc("DOC-07", "launch_action"), doc("DOC-07", "macro"), doc("DOC-07", "external_template"),
  ]) {
    const r = score([s]);
    assert.equal(r.level, "elevated", `${s.code}:${s.metadata.variant}`);
    assert.equal(r.decision, "verify_first");
  }
  // The usual trace of a file re-saved in an online editor (tool + revision +
  // stale metadata) is a reason to verify, not a "do not pay".
  const resaved = score([doc("DOC-01"), doc("DOC-02", "incremental_update"), doc("DOC-03", "producer_mismatch")]);
  assert.equal(resaved.level, "elevated");
});

test("same code, several variants: one finding at the strongest weight", () => {
  const r = score([doc("DOC-07", "embedded_file"), doc("DOC-07", "launch_action"), doc("DOC-07", "javascript")]);
  assert.equal(r.score, 30);
  assert.equal(r.findings.length, 1);
});

test("DX-1: a forgery artefact plus an impersonation or payment fact, applied once", () => {
  const r = score([doc("DOC-04", "transparent_overlay"), doc("DOC-05"), lex("PAY-01"), sem("ID-04")]);
  assert.equal(ids(r).filter((id) => id === "DX-1").length, 1);
  // DOC-02 counts only when the change came after a signature.
  assert.ok(!ids(score([doc("DOC-02", "incremental_update"), lex("PAY-01")])).includes("DX-1"));
  assert.ok(ids(score([doc("DOC-02", "after_signature"), lex("PAY-01")])).includes("DX-1"));
  // A Word signature image plus a payment request is an ordinary invoice.
  assert.ok(!ids(score([doc("DOC-04", "docx_transparent_image"), lex("PAY-01")])).includes("DX-1"));
  // Active content is not a forgery artefact.
  assert.ok(!ids(score([doc("DOC-07", "macro"), lex("PAY-01")])).includes("DX-1"));
});

test("no forced floor: a pasted transparent/upscaled image or typed-on text stays ELEVATED even on a claimed known institution", () => {
  // FLOOR-DOC-FORGED-INSTITUTION was removed (2026-09-23, see
  // docs/DOCUMENT-FORENSICS.md): a single heuristic structural signal is not
  // confident enough to force a hard "high"/scam verdict on its own, even
  // combined with a claimed institution - these signals still score their
  // own real points (and DX-1 when paired with an actual impersonation/
  // payment fact - see the DX-1 test above), just never an automatic floor.
  for (const s of [doc("DOC-04", "transparent_overlay"), doc("DOC-04", "resolution_mismatch"), doc("DOC-05")]) {
    const withInstitution = score([s], { claimedInstitution: MCB });
    assert.equal(withInstitution.level, "elevated", `${s.code}:${s.metadata.variant}`);
    assert.ok(!ids(withInstitution).includes("FLOOR-DOC-FORGED-INSTITUTION"));
    // A claimed institution alone must not change the outcome versus none.
    assert.equal(score([s]).level, "elevated");
  }
  for (const s of [doc("DOC-04", "overlay"), doc("DOC-04", "docx_transparent_image")]) {
    const r = score([s], { claimedInstitution: MCB });
    assert.equal(r.level, "low", s.metadata.variant);
    assert.ok(!ids(r).includes("FLOOR-DOC-FORGED-INSTITUTION"));
  }
});

test("document findings are deterministic evidence for confidence", () => {
  assert.equal(score([doc("DOC-04", "transparent_overlay")]).confidence, "high");
  assert.equal(score([doc("DOC-01")], { semanticStatus: "unavailable" }).confidence, "moderate");
});
