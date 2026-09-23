import { describe, expect, test } from "vitest";
import { buildAnalyzePayload, type OutlookBridge } from "../src/office-adapter";

function bridge(headersSupported = true): OutlookBridge {
  return {
    recipient: "USER@DEMO-COMPANY.EXAMPLE",
    headersSupported,
    item: {
      body: {
        getAsync(format, callback) {
          callback({
            status: "succeeded",
            value: format === "text"
              ? "Please use the updated payroll portal and enter your password."
              : `<p>Please use the updated payroll portal.</p><a href="https://demo-compan1.example/login">Open portal</a>`,
          });
        },
      },
      from: { displayName: "Demo Company Finance", emailAddress: "finance@demo-compan1.example" },
      subject: "Updated payroll portal",
      internetMessageId: "<message-1@example>",
      attachments: [
        { name: "invoice.pdf", size: 1240, contentType: "Application/PDF", isInline: false },
        { name: "logo.png", size: 200, contentType: "image/png", isInline: true },
      ],
      getAllInternetHeadersAsync(callback) {
        callback({ status: "succeeded", value: "Authentication-Results: mx; spf=fail; dkim=fail; dmarc=fail\r\nReply-To: pay@redirect.example\r\nReturn-Path: <bounce@demo-compan1.example>" });
      },
    },
  };
}

describe("Outlook request mapping", () => {
  test("sends both the body and structured emailContext to the existing API", async () => {
    const { payload, extraction } = await buildAnalyzePayload(bridge());
    expect(payload.message).toContain("updated payroll portal");
    expect(payload.emailContext).toMatchObject({
      messageId: "<message-1@example>",
      from: { name: "Demo Company Finance", address: "finance@demo-compan1.example" },
      replyTo: [{ name: null, address: "pay@redirect.example" }],
      returnPath: "bounce@demo-compan1.example",
      recipient: "USER@DEMO-COMPANY.EXAMPLE",
      authentication: { spf: "fail", dkim: "fail", dmarc: "fail" },
      attachments: [{ name: "invoice.pdf", size: 1240, contentType: "application/pdf" }],
      urls: ["https://demo-compan1.example/login"],
      threadContext: null,
      senderContext: null,
    });
    expect(extraction.headersAvailable).toBe(true);
  });

  test("missing optional Outlook capability stays unknown, never suspicious", async () => {
    const { payload, extraction } = await buildAnalyzePayload(bridge(false));
    expect(payload.emailContext.authentication).toEqual({ spf: "unknown", dkim: "unknown", dmarc: "unknown" });
    expect(payload.emailContext.replyTo).toEqual([]);
    expect(payload.emailContext.returnPath).toBeNull();
    expect(extraction.unavailable).toContain("internet headers, Reply-To and Return-Path");
  });
});
