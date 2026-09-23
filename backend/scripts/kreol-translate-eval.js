// Live Kreol translation / generation evaluation - needs a reachable model.
//
//   npm run eval:kreol:translate                          # generation fixtures (en/fr -> mfe, mfe -> en)
//   npm run eval:kreol:translate -- --suite morisienmt-dev --direction mfe-en --limit 50
//   ... --out ../data/kreol-derived/reports/kreol-translate-after.json
//
// It uses the project's existing LLM transport (services/analysis/llmClient.js:
// Ollama, or the configured hosted fallback). If no model answers, it says so
// and exits 0 with status "pending_model_access" - it never substitutes stub
// output for a quality result.
//
// What is measured: the hard safety properties (entities, negation, numbers,
// target language - see kreol/translation.js validateTranslation) as a rejection
// rate with reasons, plus chrF against the reference for the MorisienMT suite.
// Naturalness and terminology need a human: generation-review.csv is the sheet.
// The frozen MorisienMT TEST split is never read here; only the DEV export.

import { readFileSync, writeFileSync } from "node:fs";

const { translateText, createLlmProvider, DIRECTIONS } = await import("../src/services/kreol/translation.js");
const { chrF } = await import("../src/services/kreol/metrics.js");
const { callLLM } = await import("../src/services/analysis/llmClient.js");

const args = process.argv.slice(2);
const argOf = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const suite = argOf("--suite", "generation");
const limit = Number(argOf("--limit", "50"));
const direction = argOf("--direction", "mfe-en");
const outPath = argOf("--out");
const root = new URL("../../data/evaluation/kreol/", import.meta.url);
const loadJsonl = (file) => readFileSync(new URL(file, root), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const report = { suite, node: process.version, status: "running", direction: suite === "generation" ? "mixed" : direction };
const finish = (extra) => {
  Object.assign(report, extra);
  console.log(JSON.stringify(report, null, 2));
  if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  process.exit(0);
};

// Is any model reachable? One tiny call; failure means pending, not "bad quality".
try {
  await callLLM('Reply with the JSON {"ok": true}.', { timeoutMs: 10000 });
} catch (err) {
  finish({
    status: "pending_model_access",
    message: "Generation runtime implemented but live quality evaluation pending model access.",
    detail: String(err?.message ?? err).slice(0, 160),
  });
}

const provider = createLlmProvider(callLLM);
let cases;
if (suite === "generation") {
  cases = loadJsonl("generation-cases.jsonl").map((c) => ({ id: c.id, direction: c.direction, source: c.source, reference: null, category: c.category }));
} else if (suite === "morisienmt-dev") {
  if (!DIRECTIONS[direction]) throw new Error(`unknown direction ${direction}`);
  const d = DIRECTIONS[direction];
  cases = loadJsonl("morisienmt-dev.jsonl").slice(0, limit).map((r) => ({ id: r.id, direction, source: r[d.source], reference: r[d.target], category: "morisienmt-dev" }));
} else {
  throw new Error(`unknown suite ${suite}`);
}

const rows = [];
for (const c of cases) {
  const r = await translateText(c.source, c.direction, { provider });
  rows.push({ ...c, status: r.status, attempts: r.attempts, output: r.text, problems: r.problems, chrF: r.ok && c.reference ? chrF(r.text, c.reference) : null });
}
const ok = rows.filter((r) => r.status === "ok");
const reasons = {};
for (const r of rows) for (const p of r.problems) reasons[p.kind] = (reasons[p.kind] || 0) + 1;
finish({
  status: "complete",
  cases: rows.length,
  accepted: ok.length,
  rejected: rows.filter((r) => r.status === "rejected").length,
  providerErrors: rows.filter((r) => r.status === "provider_error").length,
  acceptedFirstTry: ok.filter((r) => r.attempts === 1).length,
  rejectionReasons: reasons,
  meanChrFAccepted: ok.length && ok[0].chrF !== null ? Math.round((ok.reduce((n, r) => n + r.chrF, 0) / ok.length) * 100) / 100 : null,
  note: "chrF is similarity only; naturalness and terminology need the human review sheet (generation-review.csv).",
  results: rows,
});
