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

// Offline by default: no RDAP lookup and no short-link resolution.
const noAge = { domainAge: async () => undefined, certAge: async () => undefined, certificate: async () => null, resolveShortLink: async () => null, safeBrowsing: async () => null };
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
  const age = (days) => ({ domainAge: async (d) => (lookups.push(d), days), certAge: async () => undefined, certificate: async () => null });
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
  const r = await assessUrl("https://whatever.example/", { ...noAge, domainAge: async () => { throw new Error("rdap down"); } });
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

// ---- shortened links: the destination is checked, the short link is never followed further ----

test("a shortened link is resolved and its destination checked: a lookalike behind bit.ly is flagged", async () => {
  const r = await assessUrl("https://bit.ly/abc123", { ...noAge, resolveShortLink: async () => "https://paypa1.com/signin" });
  assert.equal(r.resolvedUrl, "https://paypa1.com/signin");
  const codes = r.signals.map((s) => s.code);
  assert.ok(codes.includes("URL-05"), "the shortener itself is still noted");
  assert.ok(codes.includes("URL-01"), "the lookalike destination is flagged");
  assert.equal(r.signals.find((s) => s.code === "URL-01").metadata.viaShortener, "bit.ly");
});

test("a destination on a known-phishing list is REP-05 even behind a shortener", async () => {
  const r = await assessUrl("https://tinyurl.com/x", { ...noAge, resolveShortLink: async () => "https://phish-dedicated.top/login" });
  assert.ok(r.signals.some((s) => s.code === "REP-05"));
});

test("an unresolvable short link degrades to the plain shortener signal", async () => {
  const r = await assessUrl("https://bit.ly/gone", { ...noAge, resolveShortLink: async () => { throw new Error("timeout"); } });
  assert.equal(r.resolvedUrl, null);
  assert.deepEqual(r.signals.map((s) => s.code), ["URL-05"]);
});

test("ordinary links never call the short-link resolver", async () => {
  let called = false;
  const r = await assessUrl("https://example.org/page", { ...noAge, resolveShortLink: async () => { called = true; return null; } });
  assert.equal(called, false);
  assert.equal(r.resolvedUrl, null);
});

test("a Google Safe Browsing match is REP-05; official sites are never looked up", async () => {
  const r = await assessUrl("https://evil-download.example/x", { ...noAge, safeBrowsing: async () => "MALWARE" });
  const rep = r.signals.find((s) => s.code === "REP-05");
  assert.equal(rep.metadata.list, "google-safe-browsing");
  assert.match(rep.description, /malware/);

  let asked = false;
  await assessUrl("https://mcb.mu/", { ...noAge, safeBrowsing: async () => { asked = true; return "MALWARE"; } });
  assert.equal(asked, false);
});

test("with no registration date, a domain first seen in certificate logs days ago is a medium URL-09", async () => {
  const r = await assessUrl("https://mcb-help.mu/login", { ...noAge, certAge: async () => 3 });
  const s = r.signals.find((x) => x.code === "URL-09");
  assert.equal(s.severity, "medium");
  assert.match(s.description, /certificate logs 3 days ago/);
  assert.equal(r.domainAgeDays, null, "domainAgeDays stays the registration age");
});

test("certificate logs are always looked up and reported, but URL-09 prefers the registration date", async () => {
  const r = await assessUrl("https://old-shop.example/", { ...noAge, domainAge: async () => 4000, certAge: async () => 1 });
  assert.equal(r.firstCertificateDays, 1);
  assert.equal(r.domainAgeDays, 4000);
  assert.ok(!r.signals.some((s) => s.code === "URL-09"), "an old registration outranks a fresh certificate");
});

// ---- certificate ("green bar") and tunnel hosts ----

const EV = { validation: "EV", organization: "The Mauritius Commercial Bank Ltd", issuer: "DigiCert Inc", issuedDaysAgo: 120, expiresInDays: 200, trusted: true, problem: null };

test("the certificate is read for every https page, official sites included", async () => {
  const seen = [];
  const r = await assessUrl("https://mcb.mu/", { ...noAge, certificate: async (h) => (seen.push(h), EV) });
  assert.deepEqual(seen, ["mcb.mu"]);
  assert.equal(r.certificate.organization, "The Mauritius Commercial Bank Ltd");
  assert.equal(r.flagged, false);
  const plain = await assessUrl("http://example.org/", { ...noAge, certificate: async () => { throw new Error("must not probe plain http"); } });
  assert.equal(plain.certificate, null);
});

test("an invalid certificate is CERT-01; a brand-new one on a lookalike is CERT-02", async () => {
  const bad = await assessUrl("https://shop.example/", { ...noAge, certificate: async () => ({ ...EV, trusted: false, problem: "expired" }) });
  assert.ok(bad.signals.some((s) => s.code === "CERT-01"));
  const fresh = await assessUrl("https://mcb-secure.top/", { ...noAge, certificate: async () => ({ ...EV, validation: "DV", organization: null, issuedDaysAgo: 1 }) });
  assert.deepEqual(fresh.signals.map((s) => s.code).sort(), ["CERT-02", "URL-02"]);
});

test("tunnel and dynamic-DNS hosts are URL-11", async () => {
  for (const u of ["https://abc123.ngrok-free.app/login", "https://quiet-river.trycloudflare.com/", "http://mybank.duckdns.org/"]) {
    const r = await assessUrl(u, noAge);
    assert.ok(r.signals.some((s) => s.code === "URL-11"), u);
  }
  assert.ok(!(await assessUrl("https://ngrok.com/docs", noAge)).signals.some((s) => s.code === "URL-11"));
});
