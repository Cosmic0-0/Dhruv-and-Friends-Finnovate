// /api/check-url's assessment (url-reputation) and the known-phishing lists
// (threat-intel). THREAT_INTEL_DIR points at a fixture folder so these tests
// never depend on the live OpenPhish feed.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATABASE_URL = ":memory:";
const fixtureDir = mkdtempSync(join(tmpdir(), "fraudlens-intel-"));
writeFileSync(
  join(fixtureDir, "fixture.txt"),
  [
    "# fixture list",
    "https://phish-dedicated.top/login", // dedicated domain -> whole host
    "https://docs.google.com/forms/d/e/EVIL123/viewform", // shared host -> this path only
    "https://someone.github.io/mcb-login",
    "docs.google.com", // bare shared host - must be ignored
    "mcb.mu", // official institution - must be ignored
    "local-note.example   # inline comment is allowed",
  ].join("\n")
);
process.env.THREAT_INTEL_DIR = fixtureDir;

const { assessUrl, NEW_DOMAIN_DAYS } = await import("./index.js");
const { lookupUrl, checkThreatIntel, _reloadThreatIntel } = await import("../threat-intel/index.js");
const { reportSender } = await import("../../db/index.js");

before(() => _reloadThreatIntel());

const noAge = { domainAge: async () => undefined };
const high = (r) => r.signals.some((s) => s.severity === "high");
const codes = (r) => r.signals.map((s) => s.code);

// ---- #19: pages about a bank are not impersonations of it ----

test("#19: bank names in the path or subdomain of trusted sites are not flagged", async () => {
  for (const url of [
    "https://en.wikipedia.org/wiki/MCB_Group",
    "https://www.linkedin.com/company/mcb-group",
    "https://www.lexpress.mu/article/mcb-annual-results",
    "https://defimedia.info/sbm-bank-new-branch",
    "https://github.com/absa/some-repo",
  ]) {
    const r = await assessUrl(url, noAge);
    assert.equal(r.flagged, false, url);
  }
});

test("#19 guard: real lookalikes are still high", async () => {
  for (const url of ["https://mcb-secure-verify.top/login", "https://sbmgrop.mu/login", "https://secure-absa.mu/verify", "https://mcb.mu@mcb-login.top/verify", "https://absa-online-banking.top/"]) {
    assert.ok(high(await assessUrl(url, noAge)), url);
  }
});

test("a bank name only in the path of an unknown site is amber, in its subdomain it stays red", async () => {
  const path = await assessUrl("https://random-shop.example/mcb/login", noAge);
  assert.deepEqual(path.signals.map((s) => [s.code, s.severity]), [["URL-03", "medium"]]);
  const sub = await assessUrl("https://mcb.secure-verify.top/login", noAge);
  assert.ok(sub.signals.some((s) => s.code === "URL-03" && s.severity === "high"));
});

test("user-content hosts under trusted domains are NOT trusted", async () => {
  const r = await assessUrl("https://sites.google.com/view/mcb-login", noAge);
  assert.equal(r.trusted, false);
  assert.ok(codes(r).includes("URL-03"));
});

// ---- #24: structural link tricks ----

test("#24: shortener is low (amber), raw IP is medium, '@' disguise is high", async () => {
  const short = await assessUrl("https://bit.ly/mcbhelp", noAge);
  assert.ok(short.signals.some((s) => s.code === "URL-05" && s.severity === "low"));
  const ip = await assessUrl("http://192.168.1.1/login", noAge);
  assert.ok(ip.signals.some((s) => s.code === "URL-06" && s.severity === "medium"));
  const at = await assessUrl("https://mcb.mu@mcb-login.top/verify", noAge);
  assert.ok(at.signals.some((s) => s.code === "URL-07"));
});

test("a login path on an ordinary site is not flagged (URL-08 is message-only)", async () => {
  const r = await assessUrl("https://example.org/account/login?next=verify", noAge);
  assert.equal(r.flagged, false);
});

// ---- #25: reports come back ----

test("#25: the report count is returned, and 3+ reports become a REP-03 signal", async () => {
  const host = "reported-shop.example";
  assert.equal((await assessUrl(`https://${host}/`, noAge)).reportCount, 0);
  reportSender(host);
  reportSender(host);
  const two = await assessUrl(`https://${host}/`, noAge);
  assert.equal(two.reportCount, 2);
  assert.ok(!codes(two).includes("REP-03"));
  reportSender(host);
  const three = await assessUrl(`https://${host}/checkout`, noAge);
  assert.equal(three.reportCount, 3);
  assert.ok(codes(three).includes("REP-03"));
});

test("reports against an official or trusted domain are never shown or scored (brand poisoning)", async () => {
  for (let i = 0; i < 5; i++) reportSender("mcb.mu");
  const r = await assessUrl("https://mcb.mu/", noAge);
  assert.equal(r.reportCount, 0);
  assert.equal(r.flagged, false);
  assert.equal(r.officialInstitution, "MCB");
});

// ---- new-domain age ----

test("a domain registered days ago is flagged; an old one and a trusted one are not looked up at all", async () => {
  const lookups = [];
  const age = (days) => ({ domainAge: async (d) => (lookups.push(d), days) });
  const fresh = await assessUrl("https://login.brand-new-bank.top/verify", age(3));
  assert.ok(fresh.signals.some((s) => s.code === "URL-09" && s.severity === "high"));
  assert.equal(fresh.domainAgeDays, 3);
  assert.deepEqual(lookups, ["brand-new-bank.top"], "age is looked up for the registrable domain only");

  const month = await assessUrl("https://shop.example/", age(NEW_DOMAIN_DAYS - 10));
  assert.ok(month.signals.some((s) => s.code === "URL-09" && s.severity === "medium"));
  assert.equal((await assessUrl("https://old-shop.example/", age(4000))).flagged, false);

  lookups.length = 0;
  await assessUrl("https://www.google.com/", age(1));
  await assessUrl("https://internet.mcb.mu/", age(1));
  await assessUrl("http://10.0.0.1/", age(1));
  assert.deepEqual(lookups, [], "trusted, official and IP hosts are never age-checked");
});

test("a failing age lookup never fails the check", async () => {
  const r = await assessUrl("https://whatever.example/", { domainAge: async () => { throw new Error("rdap down"); } });
  assert.equal(r.flagged, false);
  assert.equal(r.domainAgeDays, null);
});

// ---- known-phishing lists ----

test("threat intel: a dedicated phishing domain matches on any path", () => {
  assert.equal(lookupUrl("https://phish-dedicated.top/other/page").listed, true);
  assert.equal(lookupUrl("https://phish-dedicated.top/").match, "host");
});

test("threat intel: on a shared host only the listed path matches - never the whole host", () => {
  assert.equal(lookupUrl("https://docs.google.com/forms/d/e/EVIL123/viewform").listed, true);
  assert.equal(lookupUrl("https://docs.google.com/forms/d/e/SOMEONE-ELSE/viewform").listed, false);
  assert.equal(lookupUrl("https://docs.google.com/").listed, false, "a bare shared host entry is ignored");
  assert.equal(lookupUrl("https://someone.github.io/mcb-login/step2").listed, true);
  assert.equal(lookupUrl("https://someone.github.io/portfolio").listed, false);
});

test("threat intel: official institution domains can never be blocklisted, inline comments parse", () => {
  assert.equal(lookupUrl("https://mcb.mu/").listed, false);
  assert.equal(lookupUrl("https://local-note.example/x").listed, true);
});

test("threat intel: listed page is a high REP-05 in check-url, and in message links", async () => {
  const r = await assessUrl("https://phish-dedicated.top/login", noAge);
  assert.ok(r.signals.some((s) => s.code === "REP-05" && s.severity === "high"));
  const inMessage = checkThreatIntel("Your MCB card is blocked. Unblock at https://phish-dedicated.top/unblock now");
  assert.equal(inMessage.length, 1);
  assert.equal(inMessage[0].code, "REP-05");
  assert.equal(inMessage[0].sourceType, "intel");
});
