import { describe, expect, test } from "vitest";
import { parseInternetHeaders, parseMailbox } from "../src/headers";

describe("internet header parsing", () => {
  test("reads authentication, Reply-To and Return-Path facts", () => {
    const parsed = parseInternetHeaders([
      "Authentication-Results: mx.example; spf=pass smtp.mailfrom=abc.example;",
      "\tdkim=fail header.d=abc.example; dmarc=softfail header.from=abc.example",
      "Reply-To: \"Payments\" <pay@redirect.example>, audit@example.org",
      "Return-Path: <bounce@abc.example>",
    ].join("\r\n"));
    expect(parsed.authentication).toEqual({ spf: "pass", dkim: "fail", dmarc: "softfail" });
    expect(parsed.replyTo).toEqual([
      { name: "Payments", address: "pay@redirect.example" },
      { name: null, address: "audit@example.org" },
    ]);
    expect(parsed.returnPath).toBe("bounce@abc.example");
  });

  test("uses Received-SPF fallback and preserves missing facts as unknown", () => {
    expect(parseInternetHeaders("Received-SPF: neutral (mx.example)\r\nSubject: Hello").authentication)
      .toEqual({ spf: "neutral", dkim: "unknown", dmarc: "unknown" });
    expect(parseInternetHeaders("").authentication).toEqual({ spf: "unknown", dkim: "unknown", dmarc: "unknown" });
  });

  test("rejects malformed mailboxes", () => {
    expect(parseMailbox("not an address")).toBeNull();
  });
});
