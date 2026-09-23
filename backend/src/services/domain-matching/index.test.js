import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUrls, LEGIT_DOMAINS } from "./index.js";

test("checkUrls flags a scheme-less lookalike URL", () => {
  const signals = checkUrls("Verify at mcb.nu/verify now");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "lookalike_url");
  assert.equal(signals[0].severity, "high");
});

test("checkUrls tags every signal with source: url_parser", () => {
  const signals = checkUrls("Verify at mcb.nu/verify now");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].source, "url_parser");
});

test("checkUrls flags a brand-substring lookalike domain", () => {
  const signals = checkUrls("Urgent: verify your account at https://mcb-secure.top/verify");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "lookalike_url");
  assert.match(signals[0].description, /mcb/);
});

test("checkUrls never flags a legit domain", () => {
  for (const domain of LEGIT_DOMAINS) {
    const signals = checkUrls(`Please log in at https://${domain}/login to continue`);
    assert.deepEqual(signals, []);
  }
});

test("checkUrls returns an empty array when the message has no URL", () => {
  assert.deepEqual(checkUrls("Your OTP is 4821, do not share it with anyone."), []);
});

test("checkUrls does not flag unrelated domains that merely contain brand-token letters", () => {
  // Substring matching used to flag these: myt/absa/sbm
  // appear as letter runs inside real, unrelated hostname labels.
  assert.deepEqual(checkUrls("See https://mythology-store.com/catalog for details"), []);
  assert.deepEqual(checkUrls("Order confirmed at https://absalom-books.com/order/1"), []);
  assert.deepEqual(checkUrls("Quote from https://sbmarketing.co.uk/quote"), []);
});

test("checkUrls still flags a brand token that is its own hostname label", () => {
  const signals = checkUrls("https://secure-absa.mu/verify");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "lookalike_url");
  assert.match(signals[0].description, /absa/);
});

// ---- Regression: official subdomains, short-domain collisions, link tricks. ----
import { isOfficialHost, checkLinkHygiene, maxEditDistance, splitHost } from "./index.js";

test("isOfficialHost accepts the apex and any subdomain, never a suffix lookalike", () => {
  assert.equal(isOfficialHost("mcb.mu", "mcb.mu"), true);
  assert.equal(isOfficialHost("internet.mcb.mu", "mcb.mu"), true);
  assert.equal(isOfficialHost("secure.login.mcb.mu", "mcb.mu"), true);
  assert.equal(isOfficialHost("notmcb.mu", "mcb.mu"), false);
  assert.equal(isOfficialHost("mcb.mu.evil.top", "mcb.mu"), false);
});

test("official subdomains never produce a lookalike signal", () => {
  for (const host of ["mcb.mu", "internet.mcb.mu", "secure.mcb.mu", "login.mcb.mu", "www.sbmgroup.mu"]) {
    assert.deepEqual(checkUrls(`Log in at https://${host}/account`), [], host);
  }
});

test("every official domain of a multi-domain institution is accepted", () => {
  assert.deepEqual(checkUrls("File at https://mra.gov.mu/efiling today"), []);
  assert.deepEqual(checkUrls("File at mra.mu before the deadline"), []);
});

test("short labels do not collide by edit distance (mra.mu is not an mcb.mu lookalike)", () => {
  assert.equal(maxEditDistance(3), 0);
  assert.deepEqual(checkUrls("See mrb.mu for details"), []);
  assert.deepEqual(checkUrls("See xyz.mu for details"), []);
});

test("longer official labels still catch one-character typosquats", () => {
  const [s] = checkUrls("Verify at sbmgrop.mu/login");
  assert.equal(s.code, "URL-01");
  assert.equal(s.officialDomain, "sbmgroup.mu");
});

test("registrable label is computed under multi-label public suffixes", () => {
  assert.equal(splitHost("efiling.mra.gov.mu").registrable, "mra");
  assert.equal(splitHost("shop.example.co.uk").registrable, "example");
});

test("brand in the subdomain or path of an unrelated host fires URL-03", () => {
  assert.equal(checkUrls("Go to https://mcb.secure-verify.top/login")[0].code, "URL-03");
  assert.equal(checkUrls("Go to https://evil.example/mcb/login")[0].code, "URL-03");
});

test("brand token as the registrable label fires URL-02 with the institution's official domain", () => {
  const [s] = checkUrls("Verify at mcb-secure-verify.top now");
  assert.equal(s.code, "URL-02");
  assert.equal(s.officialDomain, "mcb.mu");
  assert.equal(s.evidence, "mcb-secure-verify.top");
});

test("homoglyph host imitating an official domain fires URL-04", () => {
  const signals = checkUrls("Verify at https://mсb.mu/login"); // Cyrillic с
  const s = signals.find((x) => x.code === "URL-04");
  assert.ok(s, "expected URL-04");
  assert.equal(s.officialDomain, "mcb.mu");
});

test("userinfo trick uses the real host, and fires URL-07", () => {
  const msg = "Open https://mcb.mu@mcb-login.top/verify";
  assert.equal(checkUrls(msg)[0].domain, "mcb-login.top");
  assert.ok(checkLinkHygiene(msg).some((s) => s.code === "URL-07"));
});

test("shorteners are a weak URL-05 signal, never a lookalike", () => {
  const msg = "MCB: see https://mcb.mu/help and bit.ly/mcbhelp";
  assert.deepEqual(checkUrls(msg), []);
  const hygiene = checkLinkHygiene(msg);
  assert.equal(hygiene.length, 1);
  assert.equal(hygiene[0].code, "URL-05");
  assert.equal(hygiene[0].severity, "low");
});

test("raw IP links fire URL-06; a bare version number does not", () => {
  assert.ok(checkLinkHygiene("Login: http://192.168.4.20/mcb").some((s) => s.code === "URL-06"));
  assert.deepEqual(checkLinkHygiene("Update to version 1.2.3.4 today"), []);
});

test("URL-08: a verify/log-in call to action through an unofficial link, never through an official one", () => {
  const s = checkLinkHygiene("Klik lor oceanbank-verify-secure.test deswit pou verifye ou kont").find((x) => x.code === "URL-08");
  assert.ok(s, "expected URL-08");
  assert.equal(s.metadata.host, "oceanbank-verify-secure.test");
  assert.deepEqual(checkLinkHygiene("Log in at https://internet.mcb.mu to verify your statement"), []);
});

test("URL-08: also never fires for a trusted-domains allowlist entry, or a subdomain of one", () => {
  assert.deepEqual(checkLinkHygiene("Please verify your account at https://paypal.com/verify now"), []);
  assert.deepEqual(checkLinkHygiene("Confirm at https://pay.google.com/confirm today"), []);
});

test("URL-08 still fires for a lookalike of a trusted domain - the allowlist grants no lookalike protection", () => {
  const s = checkLinkHygiene("Verify now at https://paypal-secure-login.test/verify").find((x) => x.code === "URL-08");
  assert.ok(s, "expected URL-08 for a domain merely resembling a trusted one");
});

// ---- Regression: self-contradictory URL-08 on a page's own (sub)domain, live-observed on badssl.com. ----
import { isSameSite } from "./index.js";

test("isSameSite treats a page's own subdomains as the same site, never a different one's suffix lookalike", () => {
  assert.equal(isSameSite("dh480.badssl.com", "badssl.com"), true);
  assert.equal(isSameSite("badssl.com", "dh480.badssl.com"), true);
  assert.equal(isSameSite("www.badssl.com", "badssl.com"), true);
  assert.equal(isSameSite("badssl.com.evil-login.net", "badssl.com"), false);
  assert.equal(isSameSite("notbadssl.com", "badssl.com"), false);
});

test("checkLinkHygiene: URL-08 never names the scanned page's own domain as \"not an official domain\" (badssl.com live repro)", () => {
  // Page text as extracted from badssl.com itself: the site lists its own
  // subdomain test links as plain visible text (no scheme), which is what
  // made extractLinks() pick up "dh480.badssl.com" as a "link" at all - and
  // pageHost lets it be recognized as the current site instead of flagged.
  const pageText = "badssl.com click through dh480.badssl.com to test an old cipher suite.";
  assert.deepEqual(checkLinkHygiene(pageText, "badssl.com").filter((s) => s.code === "URL-08"), []);
  // A message with no page context (e.g. a pasted SMS) keeps prior behaviour.
  assert.ok(checkLinkHygiene(pageText).some((s) => s.code === "URL-08"));
});

test("checkLinkHygiene: a real lookalike of the current page's own domain still fires URL-08", () => {
  const s = checkLinkHygiene("click through badssl.com.evil-login.net to continue", "badssl.com").find((x) => x.code === "URL-08");
  assert.ok(s, "expected URL-08 for a suffix lookalike of the page's own domain");
  assert.equal(s.metadata.host, "badssl.com.evil-login.net");
});
