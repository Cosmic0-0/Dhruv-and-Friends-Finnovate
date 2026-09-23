// Pre-demo check: confirms /api/analyze actually fails over to the hosted
// fallback provider when Ollama is unreachable, instead of just assuming the
// LLM_MODE=auto wiring in llmClient.js works.
//
// Since the decision refactor the LLM is optional enrichment: if this check
// FAILS, /api/analyze still returns a deterministic risk assessment (see
// services/pipeline) - but the "inferred" signals and the semantic recall
// are lost, so it is still worth a green run before the demo.
//
// Run with: npm run test:fallback (from backend/)
//
// llmClient.js reads OLLAMA_URL into a module-level const at import time, so
// the only way to exercise the "Ollama unreachable" path without touching
// the real Ollama process is to set process.env.OLLAMA_URL to something
// unreachable *before* that module is imported, then dynamic-import the
// analysis service. Nothing here writes to .env.

const UNREACHABLE_OLLAMA_URL = "http://127.0.0.1:1";
const PORT = process.env.PORT || 4000;

const TEST_MESSAGE =
  "Dear customer, your MCB account has been suspended due to suspicious activity. " +
  "Verify immediately at http://mcb-secure-verify.com or your account will be closed today.";

function logSection(title) {
  console.log(`\n--- ${title} ---`);
}

async function checkLiveHealthEndpoint() {
  logSection("Step 1: GET /health/llm (best-effort, requires a running server)");
  try {
    const res = await fetch(`http://localhost:${PORT}/health/llm`, {
      signal: AbortSignal.timeout(1500),
    });
    const body = await res.json();
    console.log(`Server reachable. Current provider: ${body.activeProvider} (mode: ${body.mode})`);
    return body;
  } catch {
    console.log("No server running on this port — skipping live health check, continuing with in-process test.");
    return null;
  }
}

async function main() {
  await checkLiveHealthEndpoint();

  logSection("Step 2: force an unreachable Ollama and re-import the analysis service");
  const originalOllamaUrl = process.env.OLLAMA_URL;
  process.env.OLLAMA_URL = UNREACHABLE_OLLAMA_URL;
  process.env.LLM_MODE = "auto"; // ensure failover is actually attempted for this run
  console.log(`OLLAMA_URL overridden in-process: ${originalOllamaUrl || "(unset)"} -> ${UNREACHABLE_OLLAMA_URL}`);

  const { analyzeSemantics } = await import("../src/services/analysis/index.js");
  const { llmStatus } = await import("../src/services/analysis/llmClient.js");

  const status = llmStatus();
  console.log(`Fallback provider configured: ${status.fallbackConfigured} (${status.fallbackProvider})`);
  if (!status.fallbackConfigured) {
    console.log("\nFAIL: FALLBACK_API_KEY is not set — there is nothing to fail over to.");
    console.log("Set FALLBACK_PROVIDER / FALLBACK_API_KEY in backend/.env before the demo.");
    process.exitCode = 1;
    printSummary({ failedOver: false, elapsedMs: 0, shapeOk: false, provider: "none", reason: "fallback not configured" });
    return;
  }

  logSection("Step 3: fire a request through analyzeSemantics() (the semantic step of POST /api/analyze)");
  const capturedLogs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    capturedLogs.push(args.join(" "));
    originalLog(...args);
  };

  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || 15000;
  const start = performance.now();
  let result;
  let error;
  try {
    result = await analyzeSemantics(TEST_MESSAGE, { language: "en" });
  } catch (err) {
    error = err;
  } finally {
    console.log = originalLog;
  }
  const elapsedMs = Math.round(performance.now() - start);

  if (error) {
    console.log(`\nRequest failed: ${error.message}`);
    printSummary({ failedOver: false, elapsedMs, shapeOk: false, provider: "none", reason: error.message });
    process.exitCode = 1;
    return;
  }

  const servedLine = capturedLogs.find((l) => l.startsWith("[llm] served by"));
  const failedOver = Boolean(servedLine && servedLine.includes("served by fallback:"));
  const provider = servedLine ? servedLine.replace("[llm] served by ", "") : "unknown";

  // analyzeSemantics() never throws: status "ok" means the model answered
  // with valid, schema-conformant JSON; "unavailable"/"invalid" mean the
  // pipeline would have carried on deterministically without it.
  if (result.status !== "ok") console.log(`Semantic status: ${result.status} (${result.error ?? "no detail"})`);
  const shapeOk = Boolean(result) && result.status === "ok" && Array.isArray(result.signals);

  printSummary({ failedOver, elapsedMs, shapeOk, provider, timeoutMs, signalCount: result?.signals.length });

  const pass = failedOver && shapeOk;
  process.exitCode = pass ? 0 : 1;
}

function printSummary({ failedOver, elapsedMs, shapeOk, provider, timeoutMs, signalCount, reason }) {
  logSection("Summary");
  console.log(`Failed over to fallback provider : ${failedOver ? "yes" : "no"}`);
  console.log(`Provider that served the request : ${provider}`);
  console.log(`Time taken                       : ${elapsedMs}ms${timeoutMs ? ` (timeout budget: ${timeoutMs}ms per provider attempt)` : ""}`);
  console.log(`Response shape matches schema     : ${shapeOk ? "yes" : "no"}${signalCount !== undefined ? ` (${signalCount} signals)` : ""}`);
  if (reason) console.log(`Reason                            : ${reason}`);
  console.log(`\n${failedOver && shapeOk ? "PASS" : "FAIL"}: ${failedOver && shapeOk ? "fallback path is working" : "fallback path did not behave as expected"}`);
}

main().catch((err) => {
  console.error("\nFAIL: unexpected error running the fallback test");
  console.error(err);
  process.exitCode = 1;
});
