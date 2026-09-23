import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUrls } from "./index.js";
import { GLOBAL_BRAND_DOMAINS } from "./globalBrands.js";
import { globalBrandImitated } from "./index.js";

const codes = (text) => checkUrls(text).map((s) => s.code);

test("typo and digit-swap lookalikes of global brands are URL-01 and name the real domain", () => {
  for (const [host, official] of [
    ["paypa1.com", "paypal.com"],
    ["paypall.com", "paypal.com"],
    ["rnicrosoft.com", "microsoft.com"],
    ["netfl1x.com", "netflix.com"],
    ["arnazon.com", "amazon.com"],
  ]) {
    const signals = checkUrls(`Log in at https://${host}/signin`);
    assert.equal(signals.length, 1, host);
    assert.equal(signals[0].code, "URL-01", host);
    assert.equal(signals[0].metadata.officialDomain, official, host);
  }
});

test("a global brand, plain or disguised, inside a hyphenated domain is URL-02", () => {
  for (const [host, official] of [
    ["micros0ft-login.com", "microsoft.com"],
    ["paypal-verify.net", "paypal.com"],
    ["secure-netflix-billing.com", "netflix.com"],
  ]) {
    const signals = checkUrls(`Confirm at https://${host}/account`);
    assert.equal(signals.length, 1, host);
    assert.equal(signals[0].code, "URL-02", host);
    assert.equal(signals[0].metadata.officialDomain, official, host);
  }
});

test("the real brands, their subdomains and their country domains are never flagged", () => {
  for (const domain of GLOBAL_BRAND_DOMAINS) {
    assert.deepEqual(codes(`Log in at https://${domain}/login`), [], domain);
    assert.deepEqual(codes(`Log in at https://accounts.${domain}/login`), [], domain);
  }
  assert.deepEqual(codes("See https://amazon.co.uk/orders and https://google.fr"), []);
  assert.deepEqual(codes("Docs at https://facebook.github.io/react"), []);
});

test("ordinary domains that merely share letters with a brand are not flagged", () => {
  for (const host of ["finance.com", "email.com", "redex.com", "applesauce-recipes.com", "googleplex-tours.example", "amazonia-travel.com", "linked.com", "office.com"]) {
    assert.deepEqual(codes(`Visit https://${host}/`), [], host);
  }
});

test("look-alike Unicode letters are traced back to the global brand they imitate", () => {
  const signal = checkUrls("Sign in at https://pаypal.com/login").find((s) => s.code === "URL-04"); // Cyrillic а
  assert.ok(signal);
  assert.equal(signal.metadata.officialDomain, "paypal.com");

  const fullwidth = checkUrls("Sign in at https://ｍｉｃｒｏｓｏｆｔ.com/login").find((s) => s.code === "URL-04");
  assert.ok(fullwidth);
  assert.equal(fullwidth.metadata.officialDomain, "microsoft.com");
});

test("globalBrandImitated returns null for unrelated and genuine hosts", () => {
  assert.equal(globalBrandImitated("example.com"), null);
  assert.equal(globalBrandImitated("www.paypal.com"), null);
  assert.equal(globalBrandImitated(""), null);
});
