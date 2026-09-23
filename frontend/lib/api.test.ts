// The API client against a stubbed fetch: exact URLs (a doubled "/api/api/…"
// prefix once shipped unnoticed because browser tests mocked loosely) and
// error classification, including never surfacing raw backend text.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { analyzeDocument, analyzeMessage, analyzeScreenshot, batchScan, checkSender, reportSender } from "./api.ts";

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
  stub(200, { sender: "+230", reportCount: 1 });
  await checkSender({ sender: "+230" });
  assert.deepEqual(
    calls.map((c) => c.url),
    ["/api/analyze", "/api/batch-scan", "/api/report", "/api/analyze/screenshot", "/api/check-sender"],
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
    ["image must be a valid PNG, JPEG, or WEBP file (checked by content, not the declared type)", "image_invalid"],
    ["image could not be decoded as base64", "image_invalid"],
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

test("the current backend's sanitised 502 bodies are still classified correctly", async () => {
  stub(502, { error: "OCR failed, try again shortly" });
  let res = await analyzeScreenshot({ image: "x" });
  assert.equal(!res.ok && res.error.kind, "ocr_failed");
  stub(502, { error: "analysis failed, try again shortly" });
  res = await analyzeScreenshot({ image: "x" });
  assert.equal(!res.ok && res.error.kind, "llm_unavailable");
});

test("429 rate limiting reads as 'busy, try again', not an unexpected error", async () => {
  stub(429, { error: "too many analyze requests, try again shortly" });
  const res = await analyzeMessage({ message: "hi" });
  assert.equal(!res.ok && res.error.kind, "llm_unavailable");
  assert.equal(!res.ok && res.error.status, 429);
  assert.doesNotMatch(!res.ok ? res.error.message : "", /too many analyze requests/);
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

// ---- analyzeDocument: XMLHttpRequest (for real upload progress), same error classification ----

type SentXhr = { method: string; url: string; headers: Record<string, string>; body: string; timeout: number };
type ProgressEvt = { lengthComputable: boolean; loaded: number; total: number };

class FakeXhr {
  static sent: SentXhr[] = [];
  static respond: (xhr: FakeXhr) => void = () => {};
  status = 0;
  responseText = "";
  timeout = 0;
  upload: { onprogress: ((e: ProgressEvt) => void) | null; onload: (() => void) | null } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private req: SentXhr = { method: "", url: "", headers: {}, body: "", timeout: 0 };
  open(method: string, url: string) {
    this.req.method = method;
    this.req.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.req.headers[name] = value;
  }
  send(body: string) {
    this.req.body = body;
    this.req.timeout = this.timeout;
    FakeXhr.sent.push(this.req);
    queueMicrotask(() => FakeXhr.respond(this));
  }
  abort() {
    this.onabort?.();
  }
}

const realXhr = globalThis.XMLHttpRequest;
function withXhr(respond: (xhr: FakeXhr) => void) {
  FakeXhr.sent = [];
  FakeXhr.respond = respond;
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
}
function reply(status: number, body: unknown) {
  return (xhr: FakeXhr) => {
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    xhr.upload.onload?.();
    xhr.status = status;
    xhr.responseText = typeof body === "string" ? body : JSON.stringify(body);
    xhr.onload?.();
  };
}
afterEach(() => {
  globalThis.XMLHttpRequest = realXhr;
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const documentBlock = (previews: unknown[] = []) => ({
  fileType: "pdf",
  pageCount: 1,
  pagesAnalyzed: 1,
  textSource: "text_layer",
  textTruncated: false,
  metadata: { producer: "iLovePDF", creator: null, created: "2026-09-01T09:30:00.000Z", modified: null, incrementalUpdates: 1, signed: false },
  previews,
});
const preview = (dataUrl: string) => ({ signalCode: "DOC-04", page: 1, widthPx: 116, heightPx: 44, effectiveDpi: 48, backgroundDpi: 150, hasAlpha: true, hardEdgeRatio: 1, dataUrl });

test("document: exact path, JSON body, upload progress then 'uploaded', validated result", async () => {
  withXhr(reply(200, { ...verdict, extractedText: "text", document: documentBlock([preview(PNG)]) }));
  const progress: number[] = [];
  let uploaded = false;
  const res = await analyzeDocument(
    { file: "data:application/pdf;base64,JVBERi0=", fileName: "form.pdf", language: "en" },
    { onUploadProgress: (f) => progress.push(f), onUploaded: () => (uploaded = true) },
  );
  const [req] = FakeXhr.sent;
  assert.equal(req.method, "POST");
  assert.equal(req.url, "/api/analyze/document");
  assert.equal(req.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(req.body), { file: "data:application/pdf;base64,JVBERi0=", fileName: "form.pdf", language: "en" });
  assert.ok(req.timeout > 130_000, "longer than a text check");
  assert.deepEqual(progress, [0.5, 1]);
  assert.equal(uploaded, true);
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.data.document.metadata.producer, "iLovePDF");
  assert.equal(res.ok && res.data.document.previews.length, 1);
});

test("document: previews that aren't small PNG data URLs never reach the page", async () => {
  const bad = [preview("javascript:alert(1)"), preview("data:image/svg+xml;base64,PHN2Zz4="), preview(`${PNG}"onerror="x`), { dataUrl: PNG }];
  withXhr(reply(200, { ...verdict, extractedText: "", document: documentBlock([...bad, preview(PNG)]) }));
  const res = await analyzeDocument({ file: "x" });
  assert.equal(res.ok, true);
  assert.deepEqual(res.ok && res.data.document.previews.map((p) => p.dataUrl), [PNG]);
});

test("document: backend errors map to document reasons; raw text never surfaces", async () => {
  const cases: Array<[number, string, string]> = [
    [400, "document exceeds maximum size of 10MB", "document_too_large"],
    [400, "document must be a PDF or Word (.docx) file (checked by content, not the file name)", "document_unsupported"],
    [400, "document is password-protected", "document_encrypted"],
    [400, "document could not be read", "document_unreadable"],
    [400, "document is required and must be a base64-encoded string", "document_unreadable"],
    [413, "request body is too large", "document_too_large"],
  ];
  for (const [status, error, reason] of cases) {
    withXhr(reply(status, { error }));
    const res = await analyzeDocument({ file: "x" });
    assert.equal(!res.ok && res.error.kind, "validation", error);
    assert.equal(!res.ok && res.error.reason, reason, error);
    assert.ok(!res.ok && res.error.message !== error && !res.error.message.startsWith("document "), "friendly copy, not the backend string");
  }
  withXhr(reply(503, { error: "document analysis is busy, try again shortly" }));
  const busy = await analyzeDocument({ file: "x" });
  assert.equal(!busy.ok && busy.error.kind, "llm_unavailable");
  withXhr(reply(200, { ...verdict, extractedText: "t" }));
  const offContract = await analyzeDocument({ file: "x" });
  assert.equal(!offContract.ok && offContract.error.kind, "unexpected");
});

test("document: network error, timeout and caller abort", async () => {
  withXhr((xhr) => xhr.onerror?.());
  let res = await analyzeDocument({ file: "x" });
  assert.equal(!res.ok && res.error.kind, "network");
  withXhr((xhr) => xhr.ontimeout?.());
  res = await analyzeDocument({ file: "x" });
  assert.equal(!res.ok && res.error.kind, "timeout");
  const controller = new AbortController();
  withXhr(() => controller.abort());
  res = await analyzeDocument({ file: "x" }, { signal: controller.signal });
  assert.equal(!res.ok && res.error.kind, "aborted");
});
