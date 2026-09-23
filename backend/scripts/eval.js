// Deterministic evaluation of the FraudLens pipeline over the labelled
// corpora (data/test-payloads/{en,fr}.json + data/kreol-dataset/
// scam-corpus.jsonl). Every metric is computed here in code - never by an
// LLM. Default mode disables the semantic model so the numbers measure the
// deterministic engine alone and are reproducible:
//
//   npm run eval              # deterministic only (no LLM)
//   npm run eval -- --full    # include the semantic model (needs a reachable LLM)
//
// Positive class = expected scam OR suspicious; negative = expected safe /
// legitimate. Predicted positive = risk level elevated or above.

// Always an in-memory DB: the pipeline records community evidence and
// ScamDNA rows, and an eval run must never write into the real database.
process.env.DATABASE_URL = ":memory:";
process.env.DOMAIN_AGE_TIMEOUT_MS = process.env.DOMAIN_AGE_TIMEOUT_MS || "1";

import { readFileSync } from "node:fs";

const { runPipeline } = await import("../src/services/pipeline/index.js");

const full = process.argv.includes("--full");
const root = new URL("../../data/", import.meta.url);

function loadPayloads(file, language) {
  return JSON.parse(readFileSync(new URL(`test-payloads/${file}`, root), "utf8")).map((p) => ({
    id: p.id,
    language,
    group: p.scamType,
    message: p.message,
    positive: p.expected.verdict !== "safe",
  }));
}

function loadKreol() {
  return readFileSync(new URL("kreol-dataset/scam-corpus.jsonl", root), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((r) => r.status !== "rejected")
    .map((r) => ({ id: r.id, language: `kreol:${r.language_mix}`, group: r.scam_type, message: r.original_message, positive: r.scam_type !== "legitimate", status: r.status }));
}

const cases = [...loadPayloads("en.json", "en"), ...loadPayloads("fr.json", "fr"), ...loadKreol()];

function tally(rows) {
  const m = { tp: 0, fp: 0, tn: 0, fn: 0 };
  for (const r of rows) {
    if (r.positive && r.predicted) m.tp++;
    else if (!r.positive && r.predicted) m.fp++;
    else if (!r.positive && !r.predicted) m.tn++;
    else m.fn++;
  }
  const precision = m.tp + m.fp ? m.tp / (m.tp + m.fp) : null;
  const recall = m.tp + m.fn ? m.tp / (m.tp + m.fn) : null;
  const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : null;
  const fpr = m.fp + m.tn ? m.fp / (m.fp + m.tn) : null;
  return { n: rows.length, ...m, precision, recall, f1, fpr };
}

const pct = (x) => (x === null ? "  n/a" : `${(x * 100).toFixed(1).padStart(5)}%`);
const line = (label, t) =>
  `${label.padEnd(26)} n=${String(t.n).padStart(3)}  TP=${String(t.tp).padStart(3)} FP=${String(t.fp).padStart(3)} TN=${String(t.tn).padStart(3)} FN=${String(t.fn).padStart(3)}  P=${pct(t.precision)} R=${pct(t.recall)} F1=${pct(t.f1)} FPR=${pct(t.fpr)}`;

const rows = [];
for (const c of cases) {
  const result = await runPipeline(c.message, { semantic: { enabled: full } });
  rows.push({ ...c, predicted: result.risk.level !== "low", level: result.risk.level, score: result.risk.score, codes: result.signals.filter((s) => s.scored).map((s) => s.code) });
}

console.log(`FraudLens evaluation - ruleset rs-1.0 - mode: ${full ? "full (with semantic model)" : "deterministic (no LLM)"}`);
console.log(line("ALL", tally(rows)));
for (const lang of [...new Set(rows.map((r) => r.language))]) console.log(line(`  lang ${lang}`, tally(rows.filter((r) => r.language === lang))));
console.log(line("  kreol owner_reviewed", tally(rows.filter((r) => r.status === "owner_reviewed"))));
console.log("\nPer scam type (recall on positives, FP on legitimate):");
for (const group of [...new Set(rows.map((r) => r.group))].sort()) console.log(line(`  ${group}`, tally(rows.filter((r) => r.group === group))));

const levels = rows.reduce((acc, r) => ({ ...acc, [r.level]: (acc[r.level] || 0) + 1 }), {});
console.log("\nLevel distribution:", levels);

const misses = rows.filter((r) => r.positive !== r.predicted);
console.log(`\nMisclassified (${misses.length}):`);
for (const r of misses) console.log(`  ${r.positive ? "FN" : "FP"} ${r.id} [${r.language}] ${r.level} ${r.score} ${r.codes.join(",") || "-"} :: ${r.message.slice(0, 90)}`);
process.exit(0);
