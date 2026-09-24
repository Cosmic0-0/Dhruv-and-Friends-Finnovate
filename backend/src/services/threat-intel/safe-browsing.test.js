import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { lookupSafeBrowsing, _resetSafeBrowsingCache } from "./safe-browsing.js";

beforeEach(() => _resetSafeBrowsingCache());
const reply = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });

test("disabled without an API key: no request is made", async () => {
  let called = false;
  assert.equal(await lookupSafeBrowsing("https://x.example/", { apiKey: "", fetchImpl: async () => { called = true; } }), null);
  assert.equal(called, false);
});

test("returns the threat type on a match and null when clean", async () => {
  assert.equal(await lookupSafeBrowsing("https://bad.example/", { apiKey: "k", fetchImpl: reply({ matches: [{ threatType: "SOCIAL_ENGINEERING" }] }) }), "SOCIAL_ENGINEERING");
  assert.equal(await lookupSafeBrowsing("https://ok.example/", { apiKey: "k", fetchImpl: reply({}) }), null);
});

test("fails open on errors, timeouts and bad status", async () => {
  assert.equal(await lookupSafeBrowsing("https://a.example/", { apiKey: "k", fetchImpl: reply({}, 429) }), null);
  assert.equal(await lookupSafeBrowsing("https://b.example/", { apiKey: "k", fetchImpl: async () => { throw new Error("timeout"); } }), null);
});

test("caches verdicts per URL", async () => {
  let calls = 0;
  const fetchImpl = async () => (calls++, new Response(JSON.stringify({ matches: [{ threatType: "MALWARE" }] })));
  await lookupSafeBrowsing("https://c.example/", { apiKey: "k", fetchImpl });
  await lookupSafeBrowsing("https://c.example/", { apiKey: "k", fetchImpl });
  assert.equal(calls, 1);
});
