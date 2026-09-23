import { describe, expect, test } from "vitest";
import { extractCurrentMessageUrls, prepareEmailBody } from "../src/body";
import { buildAnalyzePayload, type OutlookBridge } from "../src/office-adapter";

const CURRENT = "Please confirm the updated payment portal before the end of the week. ".repeat(3);
const EVIL = "https://verify-account.evil.example/login";
const GOOD = "https://portal.company.example/pay";

function outlook(text: string, html: string | null): OutlookBridge {
  return {
    recipient: null,
    headersSupported: false,
    item: {
      body: {
        getAsync(format: "text" | "html", callback: (r: { status: string; value: string }) => void) {
          if (format === "html" && html === null) callback({ status: "failed", value: "" });
          else callback({ status: "succeeded", value: format === "text" ? text : (html as string) });
        },
      },
      from: { emailAddress: "a@b.example" },
    },
  } as unknown as OutlookBridge;
}

describe("URL evidence follows the analysed message, not removed history", () => {
  test("a link in the current message is kept", () => {
    expect(extractCurrentMessageUrls(`<p>${CURRENT}</p><p><a href="${EVIL}">portal</a></p>`).urls).toEqual([EVIL]);
  });

  test("Outlook reply chain: links after the From/Sent header block are dropped", () => {
    const html = `<div><p>${CURRENT}</p><a href="${GOOD}">pay</a></div><div id="appendonsend"></div><hr>` +
      `<div id="divRplyFwdMsg"><b>From:</b> x@y.example<br><b>Sent:</b> Monday<br><b>To:</b> me</div><div><a href="${EVIL}">verify</a></div>`;
    expect(extractCurrentMessageUrls(html).urls).toEqual([GOOD]);
  });

  test("Gmail-style blockquote history is dropped", () => {
    const html = `<div>${CURRENT}<a href="${GOOD}">pay</a></div><div class="gmail_quote"><div>On Mon, A wrote:</div><blockquote><a href="${EVIL}">x</a></blockquote></div>`;
    expect(extractCurrentMessageUrls(html).urls).toEqual([GOOD]);
  });

  test("text-marker chain ('On ... wrote:') without container markup is dropped too", () => {
    const html = `<p>${CURRENT}</p><p>On Mon, 1 Jan 2026, Alice wrote:</p><p>Verify at <a href="${EVIL}">${EVIL}</a></p>`;
    expect(extractCurrentMessageUrls(html).urls).toEqual([]);
  });

  test("a forwarded message after a long enough preamble is treated as history", () => {
    const html = `<p>${CURRENT}</p><p>-----Original Message-----</p><p><a href="${EVIL}">x</a></p>`;
    expect(extractCurrentMessageUrls(html).urls).toEqual([]);
  });

  test("a short reply keeps the whole thread, exactly as the analysed text does", () => {
    const text = "Thanks, confirmed.\n\nOn Mon, Alice wrote:\n> Verify your account";
    const html = `<p>Thanks, confirmed.</p><blockquote>Verify <a href="${EVIL}">here</a></blockquote>`;
    expect(prepareEmailBody(text).removedQuotedContent).toBe(false);
    expect(extractCurrentMessageUrls(html).urls).toEqual([EVIL]);
  });

  test("end to end: history is removed from both the message and the submitted URLs", async () => {
    const text = `${CURRENT}\n\nOn Mon, 1 Jan 2026, Alice wrote:\nVerify at ${EVIL}`;
    const html = `<p>${CURRENT}</p><a href="${GOOD}">pay</a><p>On Mon, 1 Jan 2026, Alice wrote:</p><blockquote><a href="${EVIL}">v</a></blockquote>`;
    const { payload, extraction } = await buildAnalyzePayload(outlook(text, html));
    expect(payload.message).not.toContain("evil");
    expect(payload.emailContext.urls).toEqual([GOOD]);
    expect(extraction.quotedContextRemoved).toBe(true);
  });

  test("plain-text-only messages submit no href evidence and do not fail", async () => {
    const { payload } = await buildAnalyzePayload(outlook(`${CURRENT} See ${EVIL}`, null));
    expect(payload.emailContext.urls).toEqual([]);
    expect(payload.message).toContain(EVIL);
  });

  test("an over-long tracking link keeps its host and path instead of being lost", () => {
    const html = `<p>${CURRENT}</p><a href="https://login.evil.example/verify?t=${"z".repeat(3000)}#frag">go</a>`;
    const result = extractCurrentMessageUrls(html);
    expect(result.urls).toEqual(["https://login.evil.example/verify"]);
    expect(result.shortened).toBe(1);
    expect(result.omitted).toBe(0);
  });

  test("duplicates collapse, over-long links are counted, and the count limit is honoured", () => {
    const many = Array.from({ length: 60 }, (_, i) => `<a href="https://site${i}.example/">l</a>`).join("");
    const long = `<a href="https://t.example/${"a".repeat(2100)}">t</a>`;
    const result = extractCurrentMessageUrls(`<p>${CURRENT}</p><a href="${GOOD}">a</a><a href="${GOOD}">dup</a>${long}${many}`);
    expect(result.urls).toHaveLength(50);
    expect(result.urls[0]).toBe(GOOD);
    expect(new Set(result.urls).size).toBe(50);
    expect(result.omitted).toBe(1 + 11);
  });
});
