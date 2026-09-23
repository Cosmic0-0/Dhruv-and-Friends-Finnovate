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

// Minimal DOM: elements with childNodes, text nodes, and a
// getComputedStyle stub driven by each element's `display` field.
const text = (value) => ({ nodeType: 3, nodeValue: value });
const el = (tagName, children = [], props = {}) => ({ nodeType: 1, tagName, childNodes: children, display: "block", ...props });

function loadContentJs({ initialText = "", appearsAfterMs = null, finalText = "", body = null } = {}) {
  let currentBody = body ?? el("BODY", initialText ? [text(initialText)] : []);
  if (appearsAfterMs !== null) {
    setTimeout(() => {
      currentBody = el("BODY", [text(finalText)]);
    }, appearsAfterMs);
  }
  const context = {
    document: {
      get body() {
        return currentBody;
      },
      getElementById: () => null,
      documentElement: { prepend: () => {} },
    },
    getComputedStyle: (node) => ({ display: node.display ?? "block", visibility: node.visibility ?? "visible" }),
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

test("content.js #28: nothing typed or pre-filled in any form field or editable region is collected", async () => {
  const body = el("BODY", [
    el("H1", [text("Sign in")]),
    el("P", [text("URGENT: Your MCB account will be suspended. Verify at mcb-secure-verify.top.")]),
    el("P", [text("Username "), el("INPUT", [], { display: "inline-block", value: "CANARY-USERNAME" })]),
    el("P", [text("Comment box"), el("TEXTAREA", [text("CANARY-TEXTAREA")], { display: "inline-block" })]),
    el("SELECT", [el("OPTION", [text("CANARY-OPTION")])]),
    el("DIV", [text("CANARY-TYPED")], { isContentEditable: true }),
    el("DIV", [el("SPAN", [text("CANARY-NESTED-EDITABLE")], { isContentEditable: true, display: "inline" })]),
    el("DIV", [text("CANARY-HIDDEN-ATTR")], { hidden: true }),
    el("DIV", [text("CANARY-DISPLAY-NONE")], { display: "none" }),
    el("SCRIPT", [text("CANARY-SCRIPT")]),
    el("DIV", [text("CANARY-BANNER")], { id: "fraudlens-warning-banner" }),
  ]);
  const ctx = loadContentJs({ body });
  const { text: extracted } = await ctx.extractPageText();
  assert.match(extracted, /Your MCB account will be suspended/);
  assert.match(extracted, /Username/);
  assert.doesNotMatch(extracted, /CANARY/, extracted);
});

test("content.js: block elements become separate lines, inline elements stay on one line", async () => {
  const body = el("BODY", [
    el("NAV", [text("Home "), el("A", [text("Login")], { display: "inline" })]),
    el("H1", [text("Security centre")]),
    el("P", [text("Line one"), el("BR"), text("line two")]),
  ]);
  const ctx = loadContentJs({ body });
  const { text: extracted } = await ctx.extractPageText();
  assert.equal(extracted, ["Home Login", "Security centre", "Line one", "line two"].join("\n"));
});

test("content.js: text inside an open shadow root is collected", async () => {
  const host = el("MY-WIDGET", [], { shadowRoot: { childNodes: [el("P", [text("Your parcel is held, pay the customs fee now")])] } });
  const ctx = loadContentJs({ body: el("BODY", [el("P", [text("Tracking page for your delivery status")]), host]) });
  const { text: extracted } = await ctx.extractPageText();
  assert.match(extracted, /pay the customs fee/);
});

// Minimal forms for collectSensitiveForms(): only what it reads.
const input = (attrs) => ({ name: attrs.name ?? "", id: attrs.id ?? "", type: attrs.type ?? "text", getAttribute: (k) => attrs[k] ?? null });
const form = (action, inputs) => ({
  getAttribute: (k) => (k === "action" ? action : null),
  querySelector: (sel) => (sel === 'input[type="password"]' ? inputs.find((i) => i.type === "password") ?? null : null),
  querySelectorAll: () => inputs,
});

test("content.js: reports password/card forms by destination host and field kind, never values", async () => {
  const ctx = loadContentJs({ initialText: "Log in to MCB Internet Banking with your password here." });
  ctx.URL = URL;
  ctx.document.querySelectorAll = () => [
    form("https://grab.evil.top/collect.php", [input({ name: "user" }), input({ type: "password", name: "pw" })]),
    form(null, [input({ autocomplete: "cc-number" })]),
    form("/search", [input({ name: "q" })]),
  ];
  const { pageForms } = await ctx.extractPageText();
  assert.deepEqual(JSON.parse(JSON.stringify(pageForms)), [
    { actionHost: "grab.evil.top", hasPassword: true, hasCard: false },
    { actionHost: null, hasPassword: false, hasCard: true },
  ]);
});

test("content.js: a page where forms can't be read still returns its text", async () => {
  const ctx = loadContentJs({ initialText: "Ordinary page text that is long enough to count as real content." });
  const result = await ctx.extractPageText();
  assert.deepEqual(JSON.parse(JSON.stringify(result.pageForms)), []);
  assert.match(result.text, /Ordinary page text/);
});
