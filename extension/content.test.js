// content.js is a plain classic script (not an ES module - see its own
// header comment: it's injected via chrome.scripting.executeScript, which
// requires a non-module script), so it can't be `import`ed like the rest of
// this directory's files. This loads the real, unmodified file into a
// sandboxed vm context with minimal document/chrome/location stubs and
// exercises its actual top-level functions directly - real code under test,
// not a reimplementation of the race-condition fix's logic.
//
// No live browser was available to reproduce the original bug against a
// real page (badssl.com / filecr.com) in this session - see the bug
// write-up. This is the closest substitute: it proves waitForRenderedText's
// retry/timeout behaviour is correct under simulated rendering delays.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(fileURLToPath(new URL("./content.js", import.meta.url)), "utf8");

function loadContentJs({ initialText = "", appearsAfterMs = null, finalText = "" } = {}) {
  let bodyText = initialText;
  if (appearsAfterMs !== null) {
    setTimeout(() => {
      bodyText = finalText;
    }, appearsAfterMs);
  }
  const context = {
    document: {
      get body() {
        return { get innerText() { return bodyText; } };
      },
      getElementById: () => null,
      documentElement: { prepend: () => {} },
    },
    location: { href: "https://example.test/page" },
    window: {},
    chrome: { runtime: { onMessage: { addListener: () => {} } } },
    setTimeout,
    Date,
    Promise,
  };
  context.window = context; // fraudlensInit reads window.__fraudlensContentScriptActive
  vm.createContext(context);
  new vm.Script(SOURCE, { filename: "content.js" }).runInContext(context);
  return context;
}

test("content.js: text already present resolves immediately, no waiting", async () => {
  const ctx = loadContentJs({ initialText: "Plenty of real visible text right on injection, no race at all here." });
  const start = Date.now();
  const result = await ctx.extractPageText();
  assert.ok(Date.now() - start < 100, "should not have polled when text was already present");
  assert.match(result.text, /Plenty of real visible text/);
  assert.equal(result.pageUrl, "https://example.test/page");
});

test("content.js: text that renders shortly after injection is still picked up (the race this bug was)", async () => {
  const finalText = "Grand Theft Auto GTA 6 Free Download For PC (2026). Publisher: Rockstar Games. Product Information table now rendered.";
  const ctx = loadContentJs({ initialText: "", appearsAfterMs: 300, finalText });
  const result = await ctx.extractPageText();
  assert.equal(result.text, finalText);
});

test("content.js: a genuinely empty page still resolves (bounded wait, not an infinite hang)", async () => {
  const ctx = loadContentJs({ initialText: "" });
  const start = Date.now();
  const result = await ctx.extractPageText();
  assert.equal(result.text, "");
  assert.ok(Date.now() - start < 1500, "must give up within the bounded window, not hang");
});
