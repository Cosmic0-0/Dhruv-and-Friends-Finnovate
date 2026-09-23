import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEmailSignals, extractAccountLast4, extractPayee } from "./index.js";
import { validateEmailContext } from "../email-context/index.js";
import { compareDomains } from "../domain-matching/index.js";

function detect(raw, opts = {}) {
  const { value, error } = validateEmailContext(raw);
  assert.equal(error, undefined);
  return detectEmailSignals(value, opts);
}
const codes = (r) => r.signals.map((s) => s.code);
const byCode = (r, code) => r.signals.find((s) => s.code === code);
const SUPPLIER_FROM = { name: "ABC Supplies Accounts", address: "finance@abc-supplies.example" };

test("compareDomains reuses URL look-alike logic: case, subdomain, homoglyph, punycode", () => {
  assert.equal(compareDomains("ABC-Supplies.example", "abc-supplies.example"), "same");
  assert.equal(compareDomains("mail.abc-supplies.example", "abc-supplies.example"), "same");
  assert.equal(compareDomains("abc-suppIies.example", "abc-supplies.example"), "lookalike");
  assert.equal(compareDomains("xn--bc-supplies-wrg.example", "abc-supplies.example"), "lookalike");
  assert.equal(compareDomains("abc-supplies.co", "abc-supplies.example"), "lookalike");
  assert.equal(compareDomains("gmail.com", "abc-supplies.example"), "different");
});

test("no emailContext -> no signals", () => {
  assert.deepEqual(detectEmailSignals(null).signals, []);
});

test("legitimate corporate email: matching From/Reply-To, DMARC pass, known supplier -> nothing", () => {
  const r = detect(
    { from: SUPPLIER_FROM, replyTo: [SUPPLIER_FROM], authentication: { spf: "pass", dkim: "pass", dmarc: "pass" }, attachments: [{ name: "Invoice-1182.pdf", contentType: "application/pdf" }] },
    { text: "Invoice INV-1182, payment to our account ending 4491.", financialRequest: true }
  );
  assert.deepEqual(codes(r), []);
  assert.equal(r.checks.supplier, "sender_matches_supplier_record");
  assert.equal(r.checks.bankDetails, "compared");
});

test("EMAIL-01: Reply-To on another domain is a low-severity finding with both domains as evidence", () => {
  const r = detect({ from: SUPPLIER_FROM, replyTo: [{ address: "abc.payments@gmail.com" }] });
  const s = byCode(r, "EMAIL-01");
  assert.equal(s.severity, "low");
  assert.equal(s.tier, "D");
  assert.equal(s.metadata.replyToDomain, "gmail.com");
  assert.equal(s.metadata.replyToFreemail, true);
});

test("EMAIL-01 not emitted for a Reply-To on the same registrable domain, or when From is missing", () => {
  assert.deepEqual(codes(detect({ from: SUPPLIER_FROM, replyTo: [{ address: "ap@billing.abc-supplies.example" }] })), []);
  assert.deepEqual(codes(detect({ replyTo: [{ address: "x@gmail.com" }] })), []);
});

test("Return-Path differing is not a signal (bounce handling is routinely delegated)", () => {
  assert.deepEqual(codes(detect({ from: SUPPLIER_FROM, returnPath: "bounces@mailer-service.example" })), []);
});

test("EMAIL-02: claimed supplier from a look-alike domain vs an unrelated domain", () => {
  const look = byCode(detect({ from: { name: "ABC Supplies", address: "accounts@abc-suppIies.example" } }), "EMAIL-02");
  assert.equal(look.metadata.variant, "lookalike");
  assert.equal(look.metadata.host, "abc-suppiies.example");
  const unrelated = byCode(detect({ from: { name: "ABC Supplies", address: "accounts@abc-supply-payments.example" } }), "EMAIL-02");
  assert.equal(unrelated.metadata.variant, "unrelated");
});

test("EMAIL-02: a look-alike sender domain is itself a supplier claim, even without the name", () => {
  const r = detect({ from: { name: "Accounts", address: "accounts@abc-suppiies.example" } });
  assert.equal(byCode(r, "EMAIL-02").metadata.variant, "lookalike");
});

test("EMAIL-02 needs a supplier record: an unknown supplier name is not a finding", () => {
  assert.deepEqual(codes(detect({ from: { name: "Zebra Trading Ltd", address: "x@zebra-trading.example" } })), []);
});

test("EMAIL-03: authentication is contextual - pass, forwarding and missing data produce nothing", () => {
  assert.deepEqual(codes(detect({ from: SUPPLIER_FROM, authentication: { spf: "fail", dkim: "fail", dmarc: "pass" } })), []);
  assert.deepEqual(codes(detect({ from: SUPPLIER_FROM, authentication: { spf: "fail", dkim: "pass" } })), [], "SPF fail + DKIM pass = forwarding");
  assert.deepEqual(codes(detect({ from: SUPPLIER_FROM })), [], "not supplied is never 'failed'");
  assert.deepEqual(codes(detect({ from: SUPPLIER_FROM, authentication: { dmarc: "none", spf: "temperror" } })), []);
  assert.equal(detect({ from: SUPPLIER_FROM }).checks.authentication, "not_provided");
});

test("EMAIL-03 variants: DMARC fail on a domain we deal with is stronger than on an unknown domain", () => {
  assert.equal(byCode(detect({ from: SUPPLIER_FROM, authentication: { dmarc: "fail" } }), "EMAIL-03").metadata.variant, "dmarc_fail_known_domain");
  assert.equal(byCode(detect({ from: { address: "x@unknown.example" }, authentication: { dmarc: "fail" } }), "EMAIL-03").metadata.variant, "dmarc_fail");
  assert.equal(byCode(detect({ from: { address: "x@unknown.example" }, authentication: { spf: "softfail" } }), "EMAIL-03").metadata.variant, "partial_fail");
});

test("EMAIL-04 only with thread history; look-alike vs different domain; same org is fine", () => {
  const prev = { previousSenders: ["finance@abc-supplies.example"] };
  assert.ok(!codes(detect({ from: { address: "finance@abc-suppiies.example" } })).includes("EMAIL-04"), "no history, no EMAIL-04");
  assert.equal(byCode(detect({ from: { address: "finance@abc-suppiies.example" }, threadContext: prev }), "EMAIL-04").metadata.variant, "lookalike");
  assert.equal(byCode(detect({ from: { address: "x@other.example" }, threadContext: prev }), "EMAIL-04").metadata.variant, "different_domain");
  assert.ok(!codes(detect({ from: { address: "ap@abc-supplies.example" }, threadContext: prev })).includes("EMAIL-04"));
});

test("EMAIL-05: attachment metadata only; a PDF invoice is normal", () => {
  assert.deepEqual(codes(detect({ attachments: [{ name: "Invoice-1182.pdf", contentType: "application/pdf" }, { name: "photo.jpg" }] })), []);
  assert.equal(byCode(detect({ attachments: [{ name: "invoice.pdf.exe" }] }), "EMAIL-05").metadata.variant, "double_extension");
  assert.equal(byCode(detect({ attachments: [{ name: "statement.pdf.html" }] }), "EMAIL-05").metadata.variant, "double_extension");
  assert.equal(byCode(detect({ attachments: [{ name: "Remittance.htm" }] }), "EMAIL-05").metadata.variant, "risky_type");
  assert.equal(byCode(detect({ attachments: [{ name: "scan.pdf", contentType: "text/html" }] }), "EMAIL-05").metadata.variant, "type_mismatch");
});

test("account extraction: last 4 digits only, incl. the redactor's own placeholder", () => {
  assert.deepEqual(extractAccountLast4("use [account ending 6789]"), ["6789"]);
  assert.deepEqual(extractAccountLast4("account number 0045 1123 6789"), ["6789"]);
  assert.deepEqual(extractAccountLast4("IBAN MU17BOMM0101101030300200001234"), ["1234"]);
  assert.deepEqual(extractAccountLast4("Total Rs 48,250 for invoice 1182, due 30/10/2026"), []);
});

test("EMAIL-06: fires only against a trusted previous account", () => {
  const changed = detect({ from: SUPPLIER_FROM }, { text: "Our bank details have changed: account ending 6789." });
  const s = byCode(changed, "EMAIL-06");
  assert.equal(s.metadata.requestedAccount, "****6789");
  assert.deepEqual(s.metadata.accountsOnRecord, ["****4491"]);

  const same = detect({ from: SUPPLIER_FROM }, { text: "Pay to account ending 4491 as usual." });
  assert.ok(!codes(same).includes("EMAIL-06"));
});

test("EMAIL-06 is NOT emitted when no baseline exists (unknown supplier or none on record)", () => {
  const unknown = detect({ from: { address: "accounts@zebra-trading.example" } }, { text: "New account ending 6789." });
  assert.ok(!codes(unknown).includes("EMAIL-06"));
  assert.equal(unknown.checks.bankDetails, "not_applicable");

  const noBaseline = detect({ from: { name: "Lagoon Office Supplies", address: "a@lagoon-office.example" } }, { text: "New account ending 6789." });
  assert.ok(!codes(noBaseline).includes("EMAIL-06"));
  assert.equal(noBaseline.checks.bankDetails, "no_baseline_on_record");
});

test("EMAIL-06 also compares paymentContext.accountLast4", () => {
  const r = detect({ from: SUPPLIER_FROM }, { text: "Please pay invoice 1182.", paymentContext: { accountLast4: "1111" } });
  assert.ok(codes(r).includes("EMAIL-06"));
});

test("EMAIL-07: payee differs from the supplier's known payee (labelled payee or paymentContext.recipient)", () => {
  assert.equal(extractPayee("Beneficiary: John Smith\nThanks"), "John Smith");
  assert.equal(extractPayee("transfer to our new account"), null, "no label, no payee guess");
  const r = detect({ from: SUPPLIER_FROM }, { text: "Beneficiary: John Smith\n" });
  assert.equal(byCode(r, "EMAIL-07").metadata.beneficiary, "John Smith");
  assert.ok(!codes(detect({ from: SUPPLIER_FROM }, { text: "Beneficiary: ABC Supplies Ltd\n" })).includes("EMAIL-07"));
  assert.ok(codes(detect({ from: SUPPLIER_FROM }, { paymentContext: { recipient: "John Smith" } })).includes("EMAIL-07"));
});

test("EMAIL-08 variants: embedded address, institution name, senior title on freemail", () => {
  assert.equal(byCode(detect({ from: { name: "payroll@acme-corp.example", address: "x@evil.example" } }), "EMAIL-08").metadata.variant, "embedded_address");
  assert.equal(byCode(detect({ from: { name: "MCB Customer Care", address: "care@mcb-notices.example" } }), "EMAIL-08").metadata.variant, "institution_name");
  assert.equal(byCode(detect({ from: { name: "Sarah Wong - CFO", address: "sarah.company.payments@gmail.com" } }), "EMAIL-08").metadata.variant, "title_on_freemail");
  assert.deepEqual(codes(detect({ from: { name: "Sarah Wong", address: "sarah@gmail.com" } })), [], "a name on Gmail alone is not evidence");
});

test("EMAIL-09: directory executive name from an external address; look-alike of our own domain", () => {
  const r = detect({ from: { name: "Jane Smith — CEO", address: "janesmith.payments@gmail.com" } });
  const s = byCode(r, "EMAIL-09");
  assert.equal(s.metadata.variant, "executive");
  assert.equal(s.metadata.role, "executive");
  assert.ok(!codes(r).includes("EMAIL-08"), "one identity fact, one signal");

  assert.deepEqual(codes(detect({ from: { name: "Jane Smith", address: "jane.smith@demo-company.example" } })), [], "the real address");
  assert.equal(byCode(detect({ from: { name: "Marie Laval", address: "marie.laval@gmail.com" } }), "EMAIL-09").metadata.variant, "employee");
  // A look-alike of our own DOMAIN is ORG-01 now (services/org-identity), not EMAIL-09 / EMAIL-08.
  assert.deepEqual(codes(detect({ from: { name: "CEO", address: "ap@demo-cornpany.example" } })), []);
});

test("EMAIL-10: financial request from an unfamiliar address at a known supplier", () => {
  const unfamiliar = { from: { address: "payments-team@abc-supplies.example" } };
  assert.ok(codes(detect(unfamiliar, { financialRequest: true })).includes("EMAIL-10"));
  assert.ok(!codes(detect(unfamiliar, { financialRequest: false })).includes("EMAIL-10"), "no money asked, no finding");
  assert.ok(!codes(detect({ from: SUPPLIER_FROM }, { financialRequest: true })).includes("EMAIL-10"));
});

test("every email signal is a deterministic rule signal with registry fields", () => {
  const r = detect(
    { from: { name: "ABC Supplies", address: "x@abc-suppiies.example" }, replyTo: [{ address: "y@gmail.com" }], authentication: { dmarc: "fail" }, attachments: [{ name: "a.pdf.exe" }] },
    { text: "account ending 6789" }
  );
  assert.ok(r.signals.length >= 4);
  for (const s of r.signals) {
    assert.equal(s.sourceType, "rule");
    assert.ok(s.code.startsWith("EMAIL-"));
    assert.ok(s.category.startsWith("email_"));
    assert.equal(typeof s.evidence, "string");
  }
});
