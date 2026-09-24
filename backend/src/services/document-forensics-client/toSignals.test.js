import { test } from "node:test";
import assert from "node:assert/strict";
import { forensicsToSignals } from "./toSignals.js";

test("an unavailable forensics service yields no signals, not an error", () => {
  assert.deepEqual(forensicsToSignals({ status: "unavailable", reason: "timeout" }), []);
  assert.deepEqual(forensicsToSignals(null), []);
  assert.deepEqual(forensicsToSignals(undefined), []);
});

test("a clean report (no indicators) yields no signals", () => {
  const signals = forensicsToSignals({ status: "ok", report: { indicators: [], signature: null } });
  assert.deepEqual(signals, []);
});

test("each known check maps to its own DOC code with the service's own confidence as severity", () => {
  const report = {
    indicators: [
      { check: "trufor", title: "TruFor flagged a region", description: "desc-trufor", confidence: "high", evidence: "ev-trufor" },
      { check: "error_level_analysis", title: "ELA anomaly", description: "desc-ela", confidence: "medium", evidence: "ev-ela" },
      { check: "layout_comparison", title: "Layout mismatch", description: "desc-layout", confidence: "medium", evidence: null },
      { check: "metadata_pdf", title: "EXIF anomaly", description: "desc-meta", confidence: "low", evidence: "ev-meta" },
    ],
    signature: {
      indicators: [
        { check: "signature_consistency", title: "Signature inconsistent", description: "desc-sig", confidence: "medium", evidence: "ev-sig" },
      ],
    },
  };
  const signals = forensicsToSignals({ status: "ok", report });
  assert.equal(signals.length, 5);

  const byCode = Object.fromEntries(signals.map((s) => [s.code, s]));
  assert.equal(byCode["DOC-09"].severity, "high");
  assert.equal(byCode["DOC-09"].description, "desc-trufor");
  assert.equal(byCode["DOC-09"].evidence, "ev-trufor");
  assert.equal(byCode["DOC-10"].severity, "medium");
  assert.equal(byCode["DOC-11"].severity, "medium");
  assert.equal(byCode["DOC-12"].severity, "low");
  assert.equal(byCode["DOC-13"].severity, "medium");

  // Every emitted signal must be a real registered code, usable as
  // runPipeline() extraSignals (sourceType !== "semantic_model"), and carry
  // its confidence as `variant` for the risk engine's per-confidence weights.
  for (const s of signals) {
    assert.equal(s.sourceType, "rule");
    assert.equal(s.category, "document_integrity");
    assert.equal(s.metadata.variant, s.severity);
  }
});

test("evidence is omitted, not set to null, when the indicator has none", () => {
  const report = {
    indicators: [{ check: "layout_comparison", title: "t", description: "d", confidence: "low", evidence: null }],
    signature: null,
  };
  const [signal] = forensicsToSignals({ status: "ok", report });
  assert.equal("evidence" in signal, false);
});

test("an unknown check name is dropped rather than guessed into a code", () => {
  const report = {
    indicators: [{ check: "some_future_check", title: "t", description: "d", confidence: "high", evidence: null }],
    signature: null,
  };
  assert.deepEqual(forensicsToSignals({ status: "ok", report }), []);
});
