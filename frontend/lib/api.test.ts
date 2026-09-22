// The API client against a stubbed fetch: exact URLs (a doubled "/api/api/…"
// prefix once shipped unnoticed because browser tests mocked loosely) and
// error classification, including never surfacing raw backend text.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { analyzeMessage, analyzeScreenshot, batchScan, reportSender } from "./api.ts";

type Call = { url: string; body: unknown };
let calls: Call[] = [];
const realFetch = globalThis.fetch;
const realWarn = console.warn;

function stub(status: number, body: unknown, contentType = "application/json") {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { "Content-Type": contentType } });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  console.warn = () => {};
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});

const verdict = { verdict: "scam", signals: [], suggestedAction: "block_sender", explanation: "x" };

test("every endpoint is called at its exact same-origin path", async () => {
  stub(200, verdict);
  await analyzeMessage({ message: "hi" });
  stub(200, { results: [], summary: { total: 0, scamCount: 0, suspiciousCount: 0, safeCount: 0 } });
  await batchScan({ messages: ["hi"] });
  stub(200, { sender: "+230", reportCount: 1, recorded: true });
  await reportSender({ sender: "+230" });
  stub(200, { extractedText: "text", ...verdict });
  await analyzeScreenshot({ image: "data:image/jpeg;base64,AAAA", language: "en" });
  assert.deepEqual(
    calls.map((c) => c.url),
    ["/api/analyze", "/api/batch-scan", "/api/report", "/api/analyze/screenshot"],
  );
});

test("screenshot request body matches the contract: { image, language }", async () => {
  stub(200, { extractedText: "text", ...verdict });
  await analyzeScreenshot({ image: "data:image/jpeg;base64,AAAA", language: "kreol" });
  assert.deepEqual(calls[0].body, { image: "data:image/jpeg;base64,AAAA", language: "kreol" });
});

test("screenshot success needs only extractedText", async () => {
  stub(200, { extractedText: "MCB ALERT: ..." });
  const res = await analyzeScreenshot({ image: "x" });
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.data.extractedText, "MCB ALERT: ...");
});

test("screenshot 400s map to specific reasons", async () => {
  const cases: Array<[string, string]> = [
    ["no readable text was found in the image", "image_no_text"],
    ["image exceeds maximum size of 5MB", "image_too_large"],
    ["image must be a valid PNG, JPEG, or WEBP file (checked by content, not the declared type)", "image_not_supported"],
    ["image could not be decoded as base64", "image_unreadable"],
    ["extracted text exceeds maximum length of 5000 characters", "image_text_too_long"],
    ["image is required and must be a base64-encoded string", "image_missing"],
  ];
  for (const [error, reason] of cases) {
    stub(400, { error });
    const res = await analyzeScreenshot({ image: "x" });
    assert.equal(res.ok, false);
    assert.equal(!res.ok && res.error.kind, "validation");
    assert.equal(!res.ok && res.error.reason, reason, error);
  }
});

test("502 'OCR failed' is ocr_failed; other 502s are LLM failures; raw text never surfaces", async () => {
  stub(502, { error: "OCR failed: worker crashed at 0x7f" });
  let res = await analyzeScreenshot({ image: "x" });
  assert.equal(!res.ok && res.error.kind, "ocr_failed");
  assert.doesNotMatch(!res.ok ? res.error.message : "", /worker|0x7f/);

  stub(502, { error: "LLM unreachable and no fallback provider configured" });
  res = await analyzeScreenshot({ image: "x" });
  assert.equal(!res.ok && res.error.kind, "llm_unavailable");
  assert.doesNotMatch(!res.ok ? res.error.message : "", /fallback provider/);
});

test("a non-JSON 5xx from the proxy means the backend is unreachable; 504 is a timeout", async () => {
  stub(500, "Internal Server Error", "text/plain");
  let res = await analyzeMessage({ message: "hi" });
  assert.equal(!res.ok && res.error.kind, "network");
  stub(504, "Gateway Timeout", "text/plain");
  res = await analyzeMessage({ message: "hi" });
  assert.equal(!res.ok && res.error.kind, "timeout");
});

test("a 404 or an off-contract body is 'unexpected', not a crash", async () => {
  stub(404, "<pre>Cannot POST /api/api/analyze</pre>", "text/html");
  let res = await analyzeMessage({ message: "hi" });
  assert.equal(!res.ok && res.error.kind, "unexpected");
  stub(200, { verdict: "maybe" });
  res = await analyzeMessage({ message: "hi" });
  assert.equal(!res.ok && res.error.kind, "unexpected");
});

test("fetch rejecting is a network error; caller abort is 'aborted'", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  let res = await analyzeMessage({ message: "hi" });
  assert.equal(!res.ok && res.error.kind, "network");

  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = (async (_u: string, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response("{}");
  }) as typeof fetch;
  res = await analyzeMessage({ message: "hi" }, { signal: controller.signal });
  assert.equal(!res.ok && res.error.kind, "aborted");
});
