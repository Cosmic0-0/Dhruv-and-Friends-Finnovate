import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySiteIntent } from "./intent.js";

const rep = (over = {}) => ({ host: "example.org", signals: [], officialInstitution: null, domainAgeDays: null, firstCertificateDays: null, certificate: null, ...over });
const sig = (code, description = `${code} fired`, severity = "high") => ({ code, description, severity });

test("a badly built government site is weak_security, with the facts that show it's genuine", () => {
  const r = classifySiteIntent({
    reputation: rep({ host: "www.mra.gov.mu", officialInstitution: "MRA", domainAgeDays: 7300, certificate: { validation: "OV", organization: "Mauritius Revenue Authority", problem: null } }),
    grade: "F",
    findings: [{ severity: "high", title: "Missing Content-Security-Policy" }],
  });
  assert.equal(r.kind, "weak_security");
  assert.match(r.headline, /no sign of fraud/);
  assert.ok(r.trustFacts.some((f) => /Official website of MRA/.test(f)));
  assert.ok(r.trustFacts.some((f) => /Government of Mauritius/.test(f)));
  assert.ok(r.trustFacts.some((f) => /registered 20 years ago/.test(f)));
  assert.ok(r.trustFacts.some((f) => /Mauritius Revenue Authority/.test(f)));
});

test("a phishing kit with perfect headers is still malicious", () => {
  for (const code of ["REP-05", "URL-01", "URL-02", "URL-11", "CERT-02"]) {
    const r = classifySiteIntent({ reputation: rep({ signals: [sig(code, "why")] }), grade: "A", findings: [] });
    assert.equal(r.kind, "malicious", code);
    assert.deepEqual(r.reasons, ["why"]);
    assert.deepEqual(r.trustFacts, [], "no reassurance on a hostile site");
  }
});

test("softer identity problems are suspicious; brand in a URL path (medium) is too", () => {
  for (const s of [sig("URL-09", "new", "medium"), sig("REP-03", "reported", "medium"), sig("CERT-01"), sig("URL-03", "path", "medium")]) {
    assert.equal(classifySiteIntent({ reputation: rep({ signals: [s] }), grade: "B", findings: [] }).kind, "suspicious", s.code);
  }
});

test("clean reputation and a decent grade is ok; unavailable reputation says so", () => {
  assert.equal(classifySiteIntent({ reputation: rep(), grade: "B", findings: [] }).kind, "ok");
  const unknown = classifySiteIntent({ reputation: null, grade: "F", findings: [] });
  assert.equal(unknown.reputationChecked, false);
  assert.match(unknown.explanation, /couldn't check this site's reputation/);
});
