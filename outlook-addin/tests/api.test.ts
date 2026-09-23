import { describe, expect, test, vi } from "vitest";
import { analyzeCurrentEmail, validResponse } from "../src/api";
import type { AnalyzePayload, AnalyzeResponse } from "../src/types";

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

  test("rejects malformed and failed backend responses", async () => {
    expect(validResponse({})).toBe(false);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "bad context" }), { status: 400 })) as unknown as typeof fetch;
    await expect(analyzeCurrentEmail(payload, { fetchImpl })).rejects.toThrow(/bad context/);
  });
});
