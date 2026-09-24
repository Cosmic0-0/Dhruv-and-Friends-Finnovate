import { describe, expect, test, vi } from "vitest";
import { analyzeCurrentEmail, analyzeScreenshot, validResponse } from "../src/api";
import type { AnalyzePayload, AnalyzeResponse, AnalyzeScreenshotPayload, AnalyzeScreenshotResponse } from "../src/types";

const payload: AnalyzePayload = {
  source: "email",
  message: "Verify this request.",
  emailContext: {
    messageId: null, from: null, replyTo: [], returnPath: null, subject: null,
    authentication: { spf: "unknown", dkim: "unknown", dmarc: "unknown" },
    attachments: [], urls: [], threadContext: null, recipient: null, senderContext: null,
  },
};

const result: AnalyzeResponse = {
  verdict: "LOW RISK", riskScore: 0, risk: { score: 0, level: "low", confidence: "limited" }, decision: "allow",
  signals: [], trace: [], actions: [{ id: "continue", text: "Continue carefully." }],
  analysis: { rulesetVersion: "rs-1.2", source: "email", semantic: { status: "unavailable" } },
};

describe("analysis API client", () => {
  test("posts the complete Outlook payload and accepts a deterministic fallback result", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual(payload);
      return new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    await expect(analyzeCurrentEmail(payload, { fetchImpl })).resolves.toEqual(result);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("rejects a request without both required inputs", async () => {
    await expect(analyzeCurrentEmail({ ...payload, message: "" })).rejects.toThrow(/both message text and email metadata/i);
  });

  test("rejects an unknown risk level and explains network failures plainly", async () => {
    expect(validResponse({ ...result, risk: { ...result.risk, level: "apocalyptic" } })).toBe(false);
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(analyzeCurrentEmail(payload, { fetchImpl: offline })).rejects.toThrow(/Could not reach FraudLens/);
  });

  test("times out with a retryable message", async () => {
    const hang = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    })) as unknown as typeof fetch;
    await expect(analyzeCurrentEmail(payload, { fetchImpl: hang, timeoutMs: 10 })).rejects.toThrow(/took too long/);
  });

  test("rejects malformed and failed backend responses", async () => {
    expect(validResponse({})).toBe(false);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "bad context" }), { status: 400 })) as unknown as typeof fetch;
    await expect(analyzeCurrentEmail(payload, { fetchImpl })).rejects.toThrow(/bad context/);
  });
});

const screenshotPayload: AnalyzeScreenshotPayload = { image: "data:image/png;base64,aGVsbG8=" };

const screenshotResult: AnalyzeScreenshotResponse = {
  ...result,
  extractedText: "Redacted OCR text",
  imageForensics: { status: "ok", checksRun: ["metadata_pdf"], checksSkipped: [] },
};

describe("screenshot analysis API client", () => {
  test("posts the screenshot payload and accepts a full response", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toContain("/analyze/screenshot");
      expect(JSON.parse(String(init?.body))).toEqual(screenshotPayload);
      return new Response(JSON.stringify(screenshotResult), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    await expect(analyzeScreenshot(screenshotPayload, { fetchImpl })).resolves.toEqual(screenshotResult);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("rejects a request without an image", async () => {
    await expect(analyzeScreenshot({ image: "" })).rejects.toThrow(/Choose a screenshot image/i);
  });

  test("rejects a response missing extractedText even if the rest of the shape is valid", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(result), { status: 200 })) as unknown as typeof fetch;
    await expect(analyzeScreenshot(screenshotPayload, { fetchImpl })).rejects.toThrow(/invalid response/i);
  });

  test("surfaces the backend's screenshot-specific error text", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "image must be a valid PNG, JPEG, or WEBP file" }), { status: 400 })) as unknown as typeof fetch;
    await expect(analyzeScreenshot(screenshotPayload, { fetchImpl })).rejects.toThrow(/valid PNG, JPEG, or WEBP file/);
  });

  test("times out and explains network failures the same way as email analysis", async () => {
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(analyzeScreenshot(screenshotPayload, { fetchImpl: offline })).rejects.toThrow(/Could not reach FraudLens/);
  });
});
