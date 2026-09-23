// @vitest-environment node
import { beforeAll, describe, expect, test } from "vitest";
import { buildAnalyzePayload, type OutlookBridge } from "../src/office-adapter";

let runPipeline: (message: string, context: Record<string, unknown>) => Promise<{ analysis: { source: string }; signals: Array<{ code: string }> }>;
let validateEmailContext: (value: unknown) => { value?: unknown; error?: string };

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.LLM_MODE = "off";
  ({ runPipeline } = await import("../../backend/src/services/pipeline/index.js"));
  ({ validateEmailContext } = await import("../../backend/src/services/email-context/index.js"));
});

function bridge(): OutlookBridge {
  const body = "Urgent: your MCB account will be suspended. Send your OTP and password now at https://mcb-secure-login.top/login";
  return {
    recipient: "analyst@demo-company.example",
    headersSupported: false,
    item: {
      body: { getAsync(format, callback) {
        if (format === "html") callback({ status: "failed", value: "" });
        else callback({ status: "succeeded", value: body });
      } },
      from: { displayName: "MCB Security", emailAddress: "security@mcb-secure-login.top" },
      subject: "Account suspended",
      internetMessageId: "<outlook-contract-1@example>",
    },
  };
}

describe("existing pipeline contract", () => {
  test("an Outlook-extracted request reaches regular SOC, SEC and URL detectors", async () => {
    const { payload } = await buildAnalyzePayload(bridge());
    const validated = validateEmailContext(payload.emailContext);
    expect(validated.error).toBeUndefined();
    const result = await runPipeline(payload.message, { emailContext: validated.value, semantic: { enabled: false }, now: Date.UTC(2026, 8, 23) });
    const families = new Set(result.signals.map((signal) => signal.code.split("-")[0]));
    expect(result.analysis.source).toBe("email");
    expect(families.has("SOC")).toBe(true);
    expect(families.has("SEC")).toBe(true);
    expect(families.has("URL")).toBe(true);
  });

  test("the same request can add ORG/EMAIL evidence without replacing payment and social-engineering checks", async () => {
    const text = "Urgently transfer Rs 80,000 today. Keep this confidential and skip the normal approval process.";
    const outlook: OutlookBridge = {
      recipient: "finance@demo-company.example",
      headersSupported: false,
      item: {
        body: { getAsync(format, callback) {
          callback(format === "text" ? { status: "succeeded", value: text } : { status: "failed", value: "" });
        } },
        from: { displayName: "Jane Smith — Chief Executive Officer", emailAddress: "jane.smith@demo-compan1.example" },
        subject: "Confidential transfer",
        internetMessageId: "<outlook-contract-2@example>",
      },
    };
    const { payload } = await buildAnalyzePayload(outlook);
    const validated = validateEmailContext(payload.emailContext);
    const result = await runPipeline(payload.message, { emailContext: validated.value, semantic: { enabled: false }, now: Date.UTC(2026, 8, 23) });
    const codes = new Set(result.signals.map((signal) => signal.code));
    expect(codes.has("ORG-01")).toBe(true);
    expect([...codes].some((code) => code.startsWith("EMAIL-"))).toBe(true);
    expect(codes.has("PAY-01")).toBe(true);
    expect(codes.has("SOC-08")).toBe(true);
  });

  test("hostile Outlook values are sanitised into a payload the backend validator accepts", async () => {
    const hostile: OutlookBridge = {
      recipient: "not an address",
      headersSupported: true,
      item: {
        body: { getAsync(format, callback) {
          callback(format === "text" ? { status: "succeeded", value: "Pay now." } : { status: "failed", value: "" });
        } },
        from: { displayName: "Ω".repeat(500), emailAddress: "/O=EXCHANGE/CN=LEGACY" },
        subject: "s".repeat(2000),
        internetMessageId: "<" + "m".repeat(999) + ">",
        attachments: [{ name: "a".repeat(999), size: 1 }],
        getAllInternetHeadersAsync: (callback) => callback({ status: "succeeded", value: "Reply-To: bad address, <ok@x.example>\r\nReturn-Path: <>" }),
      },
    };
    const { payload } = await buildAnalyzePayload(hostile);
    const validated = validateEmailContext(payload.emailContext);
    expect(validated.error).toBeUndefined();
  });
});
