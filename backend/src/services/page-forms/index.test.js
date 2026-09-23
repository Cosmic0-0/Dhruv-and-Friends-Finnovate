import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPageForms, validatePageForms, MAX_PAGE_FORMS } from "./index.js";
import { findClaimedInstitution } from "../institutions/index.js";

const mcb = findClaimedInstitution("Welcome to MCB Internet Banking")?.institution;

test("a password form on a page claiming MCB that posts to another site is a high URL-10", () => {
  const [s] = checkPageForms([{ actionHost: "collect.evil.top", hasPassword: true, hasCard: false }], { pageHost: "mcb-secure-login.top", claimedInstitution: mcb });
  assert.equal(s.code, "URL-10");
  assert.equal(s.severity, "high");
  assert.equal(s.metadata.host, "collect.evil.top");
  assert.match(s.description, /MCB/);
  assert.match(s.description, /password/);
});

test("card fields count too", () => {
  const [s] = checkPageForms([{ actionHost: "pay.evil.top", hasPassword: false, hasCard: true }], { pageHost: "mcb-rewards.top", claimedInstitution: mcb });
  assert.match(s.description, /card/);
});

test("never fires without a claimed institution, on the official site, or for same-site / official / trusted form targets", () => {
  const form = { actionHost: "collect.evil.top", hasPassword: true, hasCard: false };
  assert.deepEqual(checkPageForms([form], { pageHost: "news.example", claimedInstitution: null }), []);
  assert.deepEqual(checkPageForms([form], { pageHost: "internet.mcb.mu", claimedInstitution: mcb }), []);
  const ctx = { pageHost: "lexpress.mu", claimedInstitution: mcb };
  assert.deepEqual(checkPageForms([{ ...form, actionHost: "accounts.lexpress.mu" }], ctx), [], "own-site login (a news article about MCB)");
  assert.deepEqual(checkPageForms([{ ...form, actionHost: null }], ctx), [], "no action = submits to the page itself");
  assert.deepEqual(checkPageForms([{ ...form, actionHost: "internet.mcb.mu" }], ctx), []);
  assert.deepEqual(checkPageForms([{ ...form, actionHost: "accounts.google.com" }], ctx), [], "trusted SSO provider");
  assert.deepEqual(checkPageForms([{ actionHost: "collect.evil.top", hasPassword: false, hasCard: false }], ctx), [], "not a sensitive form");
});

test("one signal per destination host", () => {
  const forms = [
    { actionHost: "collect.evil.top", hasPassword: true, hasCard: false },
    { actionHost: "collect.evil.top", hasPassword: false, hasCard: true },
  ];
  assert.equal(checkPageForms(forms, { pageHost: "mcb-login.top", claimedInstitution: mcb }).length, 1);
});

test("validatePageForms: optional, bounded, and strict about shape", () => {
  assert.deepEqual(validatePageForms(undefined), { value: null });
  assert.deepEqual(validatePageForms([{ actionHost: "A.Example", hasPassword: true, hasCard: false }]), {
    value: [{ actionHost: "a.example", hasPassword: true, hasCard: false }],
  });
  assert.deepEqual(validatePageForms([{ actionHost: null, hasPassword: true }]).value, [{ actionHost: null, hasPassword: true, hasCard: false }]);
  assert.ok(validatePageForms("x").error);
  assert.ok(validatePageForms(Array(MAX_PAGE_FORMS + 1).fill({ actionHost: null, hasPassword: true })).error);
  assert.ok(validatePageForms([{ actionHost: "bad host!", hasPassword: true }]).error);
  assert.ok(validatePageForms([{ actionHost: "x".repeat(300), hasPassword: true }]).error);
});

test("pipeline: a bank-branded page posting its login form elsewhere is a scam; the same text without forms is not", async () => {
  process.env.DATABASE_URL ??= ":memory:";
  const { runPipeline } = await import("../pipeline/index.js");
  const text = "MCB Internet Banking. Log in to your account.";
  const ctx = { source: "pasted_text", pageHost: "mcb-online-secure.top", semantic: { enabled: false } };
  const withForm = await runPipeline(text, { ...ctx, pageForms: [{ actionHost: "grab.evil.top", hasPassword: true, hasCard: false }] });
  assert.ok(withForm.signals.some((s) => s.code === "URL-10"));
  assert.equal(withForm.verdict, "scam");
  const without = await runPipeline(text, ctx);
  assert.ok(!without.signals.some((s) => s.code === "URL-10"));
  assert.notEqual(without.verdict, "scam");
});
