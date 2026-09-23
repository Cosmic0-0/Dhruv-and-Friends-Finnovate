import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrustedDomain, TRUSTED_DOMAINS } from "./trustedDomains.js";

test("isTrustedDomain matches an exact allowlisted domain", () => {
  assert.equal(isTrustedDomain("google.com"), true);
});

test("isTrustedDomain matches any subdomain of an allowlisted domain", () => {
  assert.equal(isTrustedDomain("accounts.google.com"), true);
  assert.equal(isTrustedDomain("pay.google.com"), true);
});

test("isTrustedDomain ignores a leading www. and trailing dot, case-insensitively", () => {
  assert.equal(isTrustedDomain("WWW.Google.com"), true);
  assert.equal(isTrustedDomain("google.com."), true);
});

test("isTrustedDomain never matches a suffix lookalike", () => {
  assert.equal(isTrustedDomain("notgoogle.com"), false);
  assert.equal(isTrustedDomain("google.com.evil.top"), false);
});

test("isTrustedDomain returns false for an empty or missing host", () => {
  assert.equal(isTrustedDomain(""), false);
  assert.equal(isTrustedDomain(undefined), false);
});

test("the allowlist contains no duplicate entries", () => {
  assert.equal(new Set(TRUSTED_DOMAINS).size, TRUSTED_DOMAINS.length);
});

test("every entry is a lowercase, non-empty hostname with no scheme or path", () => {
  for (const domain of TRUSTED_DOMAINS) {
    assert.equal(domain, domain.toLowerCase(), domain);
    assert.doesNotMatch(domain, /[\s/]|^https?:/, domain);
  }
});
