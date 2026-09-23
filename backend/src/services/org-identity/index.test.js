import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEmailContext } from "../email-context/index.js";
import { detectEmailSignals } from "../email-signals/index.js";
import { detectOrgSignals } from "./index.js";
import { buildOrganisationProfile, organisationDomainRelation } from "../workplace-registry/index.js";

const profile = buildOrganisationProfile({
  version: "test-aspire-1",
  organisationId: "aspire",
  organisationName: "Aspire Ltd",
  organisationDomains: ["aspire.mu"],
  brandTokens: ["aspire"],
  people: [
    { name: "Sarah Lee", title: "Operations Officer", role: "employee", emails: ["sarah.lee@aspire.mu"] },
    { name: "Jane Smith", title: "CFO", role: "executive", emails: ["jane.smith@aspire.mu"] },
  ],
  roleMailboxes: [
    { function: "finance", labels: ["finance department", "finance team"], addresses: ["finance@aspire.mu"] },
    { function: "payroll", labels: ["payroll team"], addresses: ["payroll@aspire.mu"] },
    { function: "it", labels: ["it support"], addresses: ["it@aspire.mu"] },
  ],
});

const context = (raw) => {
  const parsed = validateEmailContext(raw);
  assert.equal(parsed.error, undefined);
  return parsed.value;
};
const codes = (r) => r.signals.map((s) => s.code);

test("protected domain classification distinguishes apex, subdomain, label split and lookalikes", () => {
  assert.deepEqual(organisationDomainRelation("aspire.mu", profile), { relation: "same", trustedDomain: "aspire.mu" });
  assert.deepEqual(organisationDomainRelation("mail.aspire.mu", profile), { relation: "same", trustedDomain: "aspire.mu" });
  assert.equal(organisationDomainRelation("a.spire.mu", profile).technique, "label_split");
  assert.equal(organisationDomainRelation("asp1re.mu", profile).technique, "confusable");
  assert.equal(organisationDomainRelation("aspíre.mu", profile).technique, "homoglyph");
  assert.equal(organisationDomainRelation("aspire-login.com", profile).technique, "brand_embedded");
  assert.equal(organisationDomainRelation("aspire.secure-login.com", profile).relation, "lookalike");
});

test("ORG-01 explains the protected-domain difference and official domains remain quiet", () => {
  for (const domain of ["asp1re.mu", "a.spire.mu", "aspire-login.com", "aspíre.mu"] ) {
    const result = detectOrgSignals(context({ from: { name: "Aspire Finance", address: `finance@${domain}` } }), { profile });
    const signal = result.signals.find((s) => s.code === "ORG-01");
    assert.ok(signal, domain);
    assert.equal(signal.metadata.comparison.expected[0], "aspire.mu");
    assert.equal(signal.metadata.comparison.observed, domain);
  }
  assert.deepEqual(detectOrgSignals(context({ from: "person@mail.aspire.mu" }), { profile }).signals, []);
});

test("employee and executive names require the From display name and trusted directory", () => {
  const sarah = detectEmailSignals(context({ from: { name: "Sarah Lee", address: "sarah.lee.aspire@gmail.com" } }), { directory: profile });
  assert.ok(codes(sarah).includes("EMAIL-09"));
  assert.equal(sarah.signals.find((s) => s.code === "EMAIL-09").metadata.variant, "employee");

  const jane = detectEmailSignals(context({ from: { name: "Jane Smith — CFO", address: "jane.smith.finance@gmail.com" } }), { directory: profile });
  assert.equal(jane.signals.find((s) => s.code === "EMAIL-09").metadata.role, "executive");

  const bodyOnly = detectEmailSignals(context({ from: "unrelated@gmail.com" }), { text: "Sarah Lee asked me to send this.", directory: profile });
  assert.ok(!codes(bodyOnly).includes("EMAIL-09"));
});

test("role impersonation is deterministic and weaker than a known person", () => {
  const result = detectOrgSignals(context({ from: { name: "Finance Department - Aspire", address: "finance.aspire@gmail.com" } }), { profile });
  const signal = result.signals.find((s) => s.code === "ORG-03");
  assert.ok(signal);
  assert.equal(signal.metadata.variant, "finance");
  assert.equal(signal.metadata.comparison.source, "organisation_profile");
});
