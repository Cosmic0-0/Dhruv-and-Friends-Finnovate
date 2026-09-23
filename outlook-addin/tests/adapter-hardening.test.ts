import { describe, expect, test } from "vitest";
import { buildAnalyzePayload, type OutlookBridge } from "../src/office-adapter";

type Callback = (result: { status: string; value: string; error?: { message?: string } }) => void;

function bridge(overrides: Record<string, unknown>, text = "Please review the invoice today.", html = ""): OutlookBridge {
  return {
    recipient: "user@demo-company.example",
    headersSupported: false,
    item: {
      body: {
        getAsync(format: "text" | "html", callback: Callback) {
          const value = format === "text" ? text : html;
          callback(value === "FAIL" ? { status: "failed", value: "", error: { message: "denied" } } : { status: "succeeded", value });
        },
      },
      ...overrides,
    },
  } as unknown as OutlookBridge;
}

describe("Outlook request mapping: hostile and degraded input", () => {
  test("values the API would reject with 400 are trimmed or omitted instead", async () => {
    const longUrl = `https://tracker.example/${"a".repeat(2100)}`;
    const { payload, extraction } = await buildAnalyzePayload(bridge({
      from: { displayName: "N".repeat(400), emailAddress: "/O=EXCH/OU=ADMIN/CN=RECIPIENTS/CN=JSMITH" },
      subject: "S".repeat(900),
      internetMessageId: `<${"m".repeat(400)}>`,
      attachments: [{ name: "x".repeat(400), size: -5, contentType: "APPLICATION/PDF" }, { name: "  ", size: 1 }],
    }, "Body text about an invoice.", `<a href="${longUrl}">a</a><a href="https://ok.example/pay">b</a>`));
    expect(payload.emailContext.from).toEqual({ name: "N".repeat(200), address: null });
    expect(payload.emailContext.subject).toHaveLength(500);
    expect(payload.emailContext.messageId).toBeNull();
    expect(payload.emailContext.attachments).toEqual([{ name: "x".repeat(255), contentType: "application/pdf", size: null }]);
    expect(payload.emailContext.urls).toEqual(["https://ok.example/pay"]);
    expect(extraction.urlsOmitted).toBe(1);
    expect(extraction.fromAddress).toBeNull();
  });

  test("falls back to HTML text when plain text fails, keeping international text intact", async () => {
    const { payload, extraction } = await buildAnalyzePayload(
      bridge({ from: { emailAddress: "a@b.example" } }, "FAIL", "<p>Bonjour — vérifiez ce paiement 支付</p>"),
    );
    expect(payload.message).toBe("Bonjour — vérifiez ce paiement 支付");
    expect(extraction.bodyFormat).toBe("html");
  });

  test("an empty or unreadable body is an explicit error, not an empty request", async () => {
    await expect(buildAnalyzePayload(bridge({}, "   ", ""))).rejects.toThrow(/readable message body/);
    await expect(buildAnalyzePayload(bridge({}, "FAIL", "FAIL"))).rejects.toThrow(/readable message body/);
    await expect(buildAnalyzePayload({ item: null, recipient: null, headersSupported: false } as unknown as OutlookBridge)).rejects.toThrow(/Open an email/);
  });

  test("a failing header call degrades to unknown instead of failing analysis", async () => {
    const failing = bridge({ getAllInternetHeadersAsync: (cb: Callback) => cb({ status: "failed", value: "" }) });
    failing.headersSupported = true;
    const { extraction } = await buildAnalyzePayload(failing);
    expect(extraction.headersAvailable).toBe(false);
  });
});
