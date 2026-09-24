import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCAM_STAGES,
  SCAM_TYPES,
  PLAYBOOKS,
  normalizeScamType,
  normalizeStage,
  getLikelyNextStages,
  getSandboxLines,
  reconcileScamType,
} from "./index.js";

test("every SCAM_TYPES entry has a PLAYBOOKS entry", () => {
  for (const type of SCAM_TYPES) assert.ok(PLAYBOOKS[type], `missing playbook for ${type}`);
});

test("every playbook's typicalStages, nextStageMap and sandboxLines only reference known SCAM_STAGES", () => {
  for (const [type, playbook] of Object.entries(PLAYBOOKS)) {
    for (const stage of playbook.typicalStages) {
      assert.ok(SCAM_STAGES.includes(stage), `${type}.typicalStages has unknown stage ${stage}`);
    }
    for (const [fromStage, nexts] of Object.entries(playbook.nextStageMap)) {
      assert.ok(SCAM_STAGES.includes(fromStage), `${type}.nextStageMap has unknown source stage ${fromStage}`);
      for (const { stage } of nexts) {
        assert.ok(SCAM_STAGES.includes(stage), `${type}.nextStageMap[${fromStage}] has unknown target stage ${stage}`);
      }
    }
    for (const stage of Object.keys(playbook.sandboxLines)) {
      assert.ok(SCAM_STAGES.includes(stage), `${type}.sandboxLines has unknown stage ${stage}`);
    }
  }
});

test("normalizeScamType accepts a known type case/whitespace-insensitively", () => {
  assert.equal(normalizeScamType("mcb_impersonation"), "MCB_IMPERSONATION");
  assert.equal(normalizeScamType("  Telco Prize Scam "), "TELCO_PRIZE_SCAM");
});

test("normalizeScamType returns null for anything unknown or malformed", () => {
  assert.equal(normalizeScamType("not_a_real_type"), null);
  assert.equal(normalizeScamType(""), null);
  assert.equal(normalizeScamType(null), null);
  assert.equal(normalizeScamType(42), null);
});

test("normalizeStage mirrors normalizeScamType's behaviour", () => {
  assert.equal(normalizeStage("otp_request"), "OTP_REQUEST");
  assert.equal(normalizeStage("nonsense"), null);
});

test("getLikelyNextStages returns a capped, ordered list for a known type/stage pair", () => {
  const next = getLikelyNextStages("MCB_IMPERSONATION", "URGENCY");
  assert.ok(next.length > 0 && next.length <= 3);
  for (const n of next) {
    assert.equal(typeof n.stage, "string");
    assert.equal(typeof n.reason, "string");
  }
});

test("getLikelyNextStages returns [] for an unknown type, unknown stage, or a stage with no mapped transitions", () => {
  assert.deepEqual(getLikelyNextStages("NOT_A_TYPE", "URGENCY"), []);
  assert.deepEqual(getLikelyNextStages("MCB_IMPERSONATION", "NOT_A_STAGE"), []);
  assert.deepEqual(getLikelyNextStages("MCB_IMPERSONATION", null), []);
  // ACCOUNT_TAKEOVER is a terminal stage in the MCB playbook - no next stages mapped.
  assert.deepEqual(getLikelyNextStages("MCB_IMPERSONATION", "ACCOUNT_TAKEOVER"), []);
});

test("getSandboxLines returns example lines for a known type/stage, [] otherwise", () => {
  const lines = getSandboxLines("FAKE_PARCEL", "PAYMENT_REQUEST");
  assert.ok(lines.length > 0);
  assert.deepEqual(getSandboxLines("FAKE_PARCEL", "ACCOUNT_TAKEOVER"), []);
  assert.deepEqual(getSandboxLines("NOT_A_TYPE", "PAYMENT_REQUEST"), []);
});

test("reconcileScamType lets the registry pick the bank when the model mislabels it", () => {
  assert.equal(reconcileScamType("BANK_ONE_IMPERSONATION", { id: "mcb" }), "MCB_IMPERSONATION");
  assert.equal(reconcileScamType("MCB_IMPERSONATION", { id: "sbm" }), "SBM_IMPERSONATION");
});

test("reconcileScamType leaves non-bank types and unmatched institutions alone", () => {
  assert.equal(reconcileScamType("FAKE_PARCEL", { id: "mcb" }), "FAKE_PARCEL");
  assert.equal(reconcileScamType("MCB_IMPERSONATION", { id: "myt" }), "MCB_IMPERSONATION");
  assert.equal(reconcileScamType("MCB_IMPERSONATION", null), "MCB_IMPERSONATION");
  assert.equal(reconcileScamType(null, { id: "mcb" }), null);
});
