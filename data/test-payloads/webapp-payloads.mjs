// Round 2 web-app payload run: every en/fr/kr payload once, sent the way the
// web app sends it (frontend/lib/redact.ts first, then POST /api/analyze
// through the Next proxy on :3000 with the UI-language hint). Restarts the
// backend every 20 checks to reset the 20-per-15-min limit.
//
//   node webapp-payloads.mjs [--only EN-01,FR-02]
//
// Needs the web app on :3000 (BACKEND_URL=http://localhost:4000). Restarts
// the backend with ./restart-backend.sh (or RESTART_SCRIPT) every 20 checks.
// Writes results/webapp-payloads.json (git-ignored; --only runs write
// webapp-payloads.only.json instead).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = here;
const { redact } = await import(pathToFileURL(join(root, "../../frontend/lib/redact.ts")).href);
const RESTART = process.env.RESTART_SCRIPT ?? join(here, "restart-backend.sh");
const APP = "http://localhost:3000";
const HINT = { en: "en", fr: "fr", kreol: "kreol" };

const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
const payloads = ["en", "fr", "kr"]
  .flatMap((l) => JSON.parse(readFileSync(join(root, `${l}.json`), "utf8")))
  .filter((p) => !only || only.has(p.id));

const base = JSON.parse(readFileSync(join(root, "consistency-results/2026-09-23T08-43-48-781Z.json"), "utf8"));
const round1 = Object.fromEntries(base.results.map((r) => [r.id, r.topVerdict]));

function restart() {
  if (!RESTART) return;
  console.log(execSync(`sh "${RESTART}"`).toString().trim());
}

const out = [];
for (let i = 0; i < payloads.length; i++) {
  if (i % 20 === 0) restart();
  const p = payloads[i];
  const { redacted } = redact(p.message);
  const t0 = Date.now();
  let row;
  try {
    const res = await fetch(`${APP}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: redacted, language: HINT[p.language] ?? "en" }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${body.error}`);
    const types = new Set(body.signals.map((s) => s.type));
    row = {
      id: p.id,
      expected: p.expected.verdict,
      round1: round1[p.id] ?? null,
      verdict: body.verdict,
      score: body.riskScore,
      level: body.risk?.level,
      decision: body.decision,
      codes: body.signals.filter((s) => s.scored !== false).map((s) => `${s.code}:${s.severity}:${s.sourceType}`),
      missingSignals: p.expected.signals.filter((t) => !types.has(t)),
      sender: body.sender ?? null,
      senderReports: body.senderReports ?? null,
      scamType: body.scamProfile?.type ?? null,
      stage: body.scamProfile?.stage ?? null,
      semantic: `${body.analysis?.semantic?.status}/${body.analysis?.semantic?.provider ?? "-"}`,
      explanation: body.explanation,
      redactedChanged: redacted !== p.message,
      ms: Date.now() - t0,
    };
  } catch (err) {
    row = { id: p.id, expected: p.expected.verdict, error: String(err.message ?? err), ms: Date.now() - t0 };
  }
  out.push(row);
  const ok = row.verdict === row.expected ? "OK  " : "MISS";
  console.log(`${ok} ${row.id} expected=${row.expected} got=${row.verdict ?? row.error} score=${row.score} r1=${row.round1} ${row.semantic ?? ""} ${row.ms}ms ${(row.codes ?? []).join(" ")}`);
}

mkdirSync(join(here, "results"), { recursive: true });
writeFileSync(join(here, "results", only ? "webapp-payloads.only.json" : "webapp-payloads.json"), JSON.stringify({ runAt: new Date().toISOString(), results: out }, null, 1));
const sets = { EN: [], FR: [], KR: [] };
for (const r of out) sets[r.id.slice(0, 2)]?.push(r);
for (const [k, rows] of Object.entries(sets)) {
  if (!rows.length) continue;
  const hit = rows.filter((r) => r.verdict === r.expected).length;
  const r1 = rows.filter((r) => r.round1 === r.expected).length;
  console.log(`${k}: ${hit}/${rows.length} match expected (round 1 majority: ${r1}/${rows.length}); errors ${rows.filter((r) => r.error).length}`);
}
