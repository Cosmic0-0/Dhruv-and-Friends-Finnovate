import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveShortLink } from "./short-links.js";
import { _internals } from "../site-security/url-safety.js";

const realLookup = _internals.lookup;
beforeEach(() => {
  _internals.lookup = async () => [{ address: "67.199.248.10", family: 4 }];
});
afterEach(() => {
  _internals.lookup = realLookup;
});

const redirectTo = (location, status = 301) => async () => new Response(null, { status, headers: location ? { location } : {} });

test("reads the destination from the shortener's redirect without following it", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, redirect: init.redirect });
    return new Response(null, { status: 301, headers: { location: "https://paypa1.com/signin" } });
  };
  assert.equal(await resolveShortLink("http://bit.ly/abc?x=1", { fetchImpl }), "https://paypa1.com/signin");
  assert.deepEqual(calls, [{ url: "https://bit.ly/abc?x=1", redirect: "manual" }], "one HTTPS request, redirects not followed");
});

test("never contacts a host that isn't a known shortener", async () => {
  let called = false;
  const result = await resolveShortLink("https://evil.example/abc", { fetchImpl: async () => { called = true; } });
  assert.equal(result, null);
  assert.equal(called, false);
});

test("returns null for non-redirects, missing Location and non-web destinations", async () => {
  assert.equal(await resolveShortLink("https://bit.ly/a", { fetchImpl: redirectTo(null, 200) }), null);
  assert.equal(await resolveShortLink("https://bit.ly/a", { fetchImpl: redirectTo(null) }), null);
  assert.equal(await resolveShortLink("https://bit.ly/a", { fetchImpl: redirectTo("javascript:alert(1)") }), null);
});

test("a relative Location is resolved against the shortener", async () => {
  assert.equal(await resolveShortLink("https://bit.ly/a", { fetchImpl: redirectTo("/landing") }), "https://bit.ly/landing");
});

test("refuses when the shortener's name resolves to a private address", async () => {
  _internals.lookup = async () => [{ address: "10.0.0.5", family: 4 }];
  await assert.rejects(resolveShortLink("https://bit.ly/a", { fetchImpl: redirectTo("https://x.example/") }));
});
