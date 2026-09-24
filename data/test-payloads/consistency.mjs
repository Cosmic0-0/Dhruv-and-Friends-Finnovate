// Consistency checker: sends each test message to the AI several times and
// reports how often the answer changes. Gives the Kreol/prompt-tuning work
// numbers to compare before and after a fix.
//
// Run from the repo root (needs `npm install` in backend/ and a reachable
// model, same settings as backend/.env):
//
//   node data/test-payloads/consistency.mjs                 all payloads + seed messages, 3 runs each
//   node data/test-payloads/consistency.mjs --runs 5
//   node data/test-payloads/consistency.mjs --only EN-01,FR-09,KR-01,SEED-0012
//   node data/test-payloads/consistency.mjs --set seed      only the sender-reputation seed messages
//
// Calls the analysis service in-process, like backend/scripts/check-llm-fallback.js,
// so the /api/analyze rate limit (20 per 15 min) doesn't apply. Only the AI
// part is tested: the deterministic lookalike-URL check is added by the
// route and never varies, so it isn't included here.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(here, "../../backend");

export function loadCases(set = "all") {
  const cases = [];
  if (set === "all" || set === "payloads") {
    for (const f of ["en.json", "fr.json", "kr.json"]) {
      for (const p of JSON.parse(readFileSync(join(here, f), "utf8"))) {
        cases.push({ id: p.id, language: p.language, message: p.message, expectedVerdict: p.expected.verdict });
      }
    }
  }
  if (set === "all" || set === "seed") {
    const seed = JSON.parse(readFileSync(join(here, "../sender-reputation-seed/senders.json"), "utf8"));
    for (const s of seed) {
      const local = s.sender.replace(/\D/g, "").slice(-8);
      cases.push({ id: `SEED-${local.slice(-4)}`, language: s.demoLanguage, message: s.demoMessage, expectedVerdict: "scam", expectedSender: local });
    }
  }
  return cases;
}

// True if the sender the AI picked out is the seeded number, i.e. the
// "reported N times" lookup would find it.
function senderMatches(sender, local) {
  return typeof sender === "string" && sender.replace(/\D/g, "").endsWith(local);
}

// Turns N raw runs of one case into the numbers that matter.
export function summarize(c, runs) {
  const ok = runs.filter((r) => !r.error);
  const verdicts = {};
  for (const r of ok) verdicts[r.verdict] = (verdicts[r.verdict] || 0) + 1;
  const [topVerdict, topCount] = Object.entries(verdicts).sort((a, b) => b[1] - a[1])[0] || [null, 0];

  const signalCounts = {};
  for (const r of ok) for (const t of new Set(r.signalTypes)) signalCounts[t] = (signalCounts[t] || 0) + 1;
  const unstableSignals = Object.entries(signalCounts)
    .filter(([, n]) => n < ok.length)
    .map(([t, n]) => `${t} ${n}/${ok.length}`);

  const scores = ok.map((r) => r.riskScore).filter((s) => typeof s === "number");
  const summary = {
    id: c.id,
    runs: runs.length,
    errors: runs.length - ok.length,
    verdicts,
    topVerdict,
    verdictAgreement: ok.length ? topCount / ok.length : 0,
    matchesExpected: ok.filter((r) => r.verdict === c.expectedVerdict).length,
    expectedVerdict: c.expectedVerdict,
    riskScoreRange: scores.length ? [Math.min(...scores), Math.max(...scores)] : null,
    unstableSignals,
    providers: [...new Set(ok.map((r) => r.provider).filter(Boolean))],
  };
  if (c.expectedSender) summary.senderFound = ok.filter((r) => senderMatches(r.sender, c.expectedSender)).length;
  summary.stable = summary.errors === 0 && summary.verdictAgreement === 1 && (summary.senderFound ?? ok.length) === ok.length;
  return summary;
}

function parseArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    runs: Number(get("--runs")) || 3,
    set: get("--set") || "all",
    only: get("--only")?.split(",").map((s) => s.trim().toUpperCase()),
  };
}

async function main() {
  const { runs, set, only } = parseArgs(process.argv.slice(2));
  try {
    process.loadEnvFile(join(backendDir, ".env"));
  } catch {}
  const { runPipeline } = await import(pathToFileURL(join(backendDir, "src/services/pipeline/index.js")).href);

  let cases = loadCases(set);
  if (only) cases = cases.filter((c) => only.includes(c.id));
  if (cases.length === 0) {
    console.error("No test messages matched.");
    process.exitCode = 1;
    return;
  }
  console.log(`Checking ${cases.length} messages x ${runs} runs (LLM_MODE=${process.env.LLM_MODE || "auto"})\n`);

  // llmClient logs which provider answered (and why Ollama failed, if it
  // did); capture that instead of printing it.
  const log = console.log;
  let provider, llmLog;
  const results = [];
  for (const c of cases) {
    const raw = [];
    for (let i = 0; i < runs; i++) {
      provider = undefined;
      llmLog = [];
      console.log = (...a) => {
        const line = String(a[0]);
        if (line.startsWith("[llm]")) llmLog.push(line);
        const m = /^\[llm\] served by (\S+)/.exec(line);
        if (m) provider = m[1];
      };
      const started = Date.now();
      try {
        const r = await runPipeline(c.message, { language: c.language });
        raw.push({ verdict: r.verdict, riskScore: r.riskScore, signalTypes: r.signals.map((s) => s.type), sender: r.sender, provider, ms: Date.now() - started });
      } catch (err) {
        raw.push({ error: [...llmLog, err.message].join(" -> "), ms: Date.now() - started });
      } finally {
        console.log = log;
      }
    }
    const s = summarize(c, raw);
    results.push({ ...s, raw });
    const verdicts = Object.entries(s.verdicts).map(([v, n]) => `${v} ${n}`).join(", ") || "-";
    const sender = s.senderFound === undefined ? "" : `  sender found ${s.senderFound}/${runs - s.errors}`;
    log(`${s.stable ? "ok      " : "UNSTABLE"} ${c.id.padEnd(10)} ${verdicts}${s.errors ? `  errors ${s.errors}` : ""}${sender}`);
  }

  const unstable = results.filter((r) => !r.stable);
  log(`\n${results.length - unstable.length}/${results.length} messages gave the same answer every run.`);
  for (const r of unstable) {
    const bits = [
      `verdicts ${JSON.stringify(r.verdicts)} (expected ${r.expectedVerdict})`,
      r.errors && `${r.errors} errors (first: ${r.raw.find((x) => x.error).error})`,
      r.senderFound !== undefined && `sender found ${r.senderFound}/${r.runs - r.errors}`,
      r.riskScoreRange && `risk score ${r.riskScoreRange[0]}-${r.riskScoreRange[1]}`,
      r.unstableSignals.length && `signals that come and go: ${r.unstableSignals.join(", ")}`,
    ].filter(Boolean);
    log(`  ${r.id}: ${bits.join("; ")}`);
  }

  const outDir = join(here, "consistency-results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(outFile, JSON.stringify({ runAt: new Date().toISOString(), runsPerMessage: runs, set, llmMode: process.env.LLM_MODE || "auto", results }, null, 2));
  log(`\nFull results: ${outFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
