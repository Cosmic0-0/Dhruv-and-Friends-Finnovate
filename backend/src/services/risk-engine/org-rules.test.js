import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSignal } from "../signals/registry.js";
import { score, RULESET_RS_1_1 } from "./index.js";

const sig = (code, metadata = {}, sourceType = "rule") => makeSignal(code, { sourceType, metadata });

test("rs-1.1 remains frozen/selectable and does not score ORG findings", () => {
  assert.equal(RULESET_RS_1_1.weights["ORG-01"], undefined);
  assert.equal(score([sig("ORG-01")], {}, "rs-1.1").score, 0);
});

test("ORG-01, EMAIL-09 and a URL finding on one host score as one fact", () => {
  const result = score([
    sig("ORG-01", { host: "asp1re.mu", variant: "confusable" }),
    sig("EMAIL-09", { host: "asp1re.mu", variant: "lookalike_org_domain" }),
    sig("URL-01", { host: "asp1re.mu" }),
  ]);
  assert.equal(result.score, 30);
  assert.equal(result.findings.length, 1);
  assert.deepEqual(new Set(result.findings[0].corroboratedBy), new Set(["EMAIL-09", "URL-01"]));
});

test("first-seen remains weak; organisation impersonation plus payment uses one traced interaction", () => {
  assert.equal(score([sig("ORG-04")]).score, 3);
  const combined = score([sig("ORG-01", { host: "asp1re.mu" }), sig("PAY-01", {}, "lexicon")]);
  assert.equal(combined.score, 53);
  assert.equal(combined.trace.filter((t) => t.id === "OX-1").length, 1);
});

test("campaign evidence is conservative and analyst-confirmed fraud has an auditable floor", () => {
  const campaign = score([sig("ORG-06", {}, "community")]);
  assert.equal(campaign.score, 10);
  assert.equal(campaign.level, "low");
  const confirmed = score([sig("ORG-05", {}, "intel")]);
  assert.equal(confirmed.level, "high");
  assert.equal(confirmed.score, 45);
  assert.ok(confirmed.trace.some((t) => t.id === "FLOOR-ORG05-CONFIRMED"));
});
