import { describe, expect, test } from "vitest";
import { BODY_LIMIT, extractUrlsFromHtml, htmlToText, prepareEmailBody } from "../src/body";

describe("email body preparation", () => {
  test("normalises text and removes a quoted thread only after the current message", () => {
    const current = `Please verify this payment request with the finance controller before acting. ${"Evidence ".repeat(18)}`;
    const result = prepareEmailBody(`${current}\r\n----- Original Message -----\r\nIgnore this quoted history`);
    expect(result.text).toContain("Please verify this payment request");
    expect(result.text).not.toContain("quoted history");
    expect(result.removedQuotedContent).toBe(true);
  });

  test("does not remove a marker from a short current message", () => {
    const result = prepareEmailBody("Short note\n----- Original Message -----\ncontext");
    expect(result.removedQuotedContent).toBe(false);
  });

  test("caps the submitted body at the backend-safe limit", () => {
    const result = prepareEmailBody("x".repeat(BODY_LIMIT + 500));
    expect(result.text).toHaveLength(BODY_LIMIT);
    expect(result.truncated).toBe(true);
  });

  test("converts HTML safely and extracts only HTTP targets", () => {
    const html = `<p>Pay <strong>now</strong></p><script>steal()</script><a href="https://asp1re.example/login">portal</a><a href="javascript:alert(1)">bad</a>`;
    expect(htmlToText(html)).toBe("Pay nowportalbad");
    expect(extractUrlsFromHtml(html)).toEqual(["https://asp1re.example/login"]);
  });
});
