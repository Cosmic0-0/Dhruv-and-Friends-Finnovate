// runPipeline's document hooks: pre-computed deterministic signals and the
// "document" source. The semantic model is off; nothing here needs a network.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = "50";

const { runPipeline, SOURCES } = await import("./index.js");
const { makeSignal } = await import("../signals/registry.js");

const OFF = { enabled: false };
const pasted = makeSignal("DOC-04", { sourceType: "rule", metadata: { variant: "transparent_overlay", page: 1 } });

test("extraSignals are scored like any other deterministic evidence", async () => {
  const r = await runPipeline("Please transfer MUR 18,500 from my account.", {
    source: "document",
    extraSignals: [pasted],
    extraDetectorVersions: { document: "document-1.0" },
    semantic: OFF,
  });
  assert.ok(SOURCES.includes("document"));
  assert.equal(r.analysis.source, "document");
  assert.equal(r.analysis.detectorVersions.document, "document-1.0");
  // DOC-04 25 + PAY-01 8 + DX-1 15 = 48.
  assert.equal(r.risk.score, 48);
  assert.equal(r.risk.level, "high");
  assert.ok(r.signals.some((s) => s.code === "DOC-04" && s.scored));
  assert.ok(r.actions.some((a) => a.id === "doc_verify_with_issuer"));
});

test("extraSignals cannot smuggle in unknown codes or model evidence", async () => {
  const forged = [
    { ...pasted, code: "DOC-99" },
    makeSignal("PAY-03", { sourceType: "semantic_model", evidence: "safe account" }),
    null,
  ];
  const r = await runPipeline("Hello, see you tomorrow.", { source: "document", extraSignals: forged, semantic: OFF });
  assert.equal(r.risk.score, 0);
  assert.deepEqual(r.signals, []);
});

test("a document with no readable text still gets a full deterministic verdict", async () => {
  const r = await runPipeline("", { source: "document", extraSignals: [makeSignal("DOC-07", { sourceType: "rule", metadata: { variant: "macro" } })], semantic: OFF });
  assert.equal(r.risk.level, "elevated");
  assert.equal(r.analysis.semantic.status, "skipped");
  assert.ok(r.actions.some((a) => a.id === "doc_dont_enable_content"));
});
