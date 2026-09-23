// Non-LLM, deterministic workplace-email detectors (EMAIL-01..EMAIL-10).
//
// Input: validated emailContext (services/email-context) + the analysis text
// + optional paymentContext + trusted reference data (services/workplace-
// registry: demo supplier registry, demo organisation directory).
// Output: registry signals. NO scoring here - the rs-1.x risk engine owns
// every point, interaction and floor.
//
// Evidence discipline (the "no fabricated certainty" rule):
//   - A check runs only when the evidence it needs was supplied. Missing
//     From / auth / thread / supplier baseline => no signal, never a "fail".
//   - EMAIL-04 needs threadContext.previousSenders.
//   - EMAIL-06 needs a trusted previous account for the supplier; an account
//     number in an email is NOT suspicious on its own.
//   - EMAIL-07 needs trusted known payees for the supplier.
//   - EMAIL-09 needs a directory entry for the impersonated person, or a
//     look-alike of the organisation's own domain.
//   - Authentication is contextual evidence: DMARC pass => no EMAIL-03;
//     SPF fail with DKIM pass (typical forwarding) => no EMAIL-03.
//
// Demo note: the supplier bank-change fixture (fixtures/email-demo.json)
// shows EMAIL-06 with the masked on-record account next to the requested
// one; the "no baseline" fixture shows the same email about an unknown
// supplier producing NO EMAIL-06 - that contrast is the point to make live.

import { compareDomains, impersonationTechnique, registrableDomain } from "../domain-matching/index.js";
import { findClaimedInstitution, isOfficialHost } from "../institutions/index.js";
import { namesMatch } from "../payment-context/index.js";
import { makeSignal } from "../signals/registry.js";
import {
  DEMO_ORGANISATION,
  DEMO_SUPPLIERS,
  nameKey,
  findPersonByName,
  findSupplierByDomain,
  findSupplierByName,
  organisationDomainRelation,
} from "../workplace-registry/index.js";

export const EMAIL_DETECTOR_VERSION = "email-1.1";

export const FREEMAIL_DOMAINS = Object.freeze(new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.fr", "ymail.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.net", "mail.com", "yandex.com", "zoho.com", "orange.mu",
]));

// Types that execute or render active content when opened. A PDF / Office
// document / image is normal business mail and is never flagged by type.
const RISKY_EXTENSIONS = new Set([
  "html", "htm", "shtml", "xhtml", "svg", "iso", "img", "vhd", "vhdx", "exe", "scr", "com", "pif", "bat", "cmd", "js", "jse",
  "vbs", "vbe", "wsf", "hta", "lnk", "msi", "ps1", "jar", "cab", "reg",
]);
const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "jpg", "jpeg", "png", "zip", "rtf", "odt"]);
const ACTIVE_CONTENT_TYPES = /^(?:text\/html|application\/(?:x-msdownload|x-msdos-program|javascript|x-javascript|hta|x-iso9660-image|vnd\.ms-htmlhelp)|image\/svg\+xml)/;
const RTL_OVERRIDE = /[‮‭]/;

const EXEC_TITLE_RE = /\b(?:ceo|cfo|coo|md|chief [a-z]+ officer|managing director|finance director|director general|president|chairman|chairperson|directeur(?: g[ée]n[ée]ral| financier)?|pdg|head of finance)\b/iu;
const EMBEDDED_ADDRESS_RE = /[^\s<>"'@]+@([a-z0-9.-]+\.[a-z]{2,})/iu;

// Account numbers the message asks to be paid into, reduced to last 4 digits
// (all FraudLens ever compares or keeps). Matches the redactor's own output
// "[account ending 6789]" too, so redacted text still works.
const ACCOUNT_ENDING_RE = /\b(?:account|acct|a\/c|iban|compte|kont)\b[^.\n]{0,20}?\b(?:ending|ends|se terminant par)\s*(?:in\s+|with\s+|par\s+)?(\d{4})\b/giu;
const ACCOUNT_NUMBER_RE = /\b(?:account|acct|a\/c|iban|compte|kont)\b(?:\s+(?:number|no\.?|num[ée]ro|nimero|#))?\s*[:#-]?\s*((?:[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){8,30})|\d[\d -]{4,28}\d)/giu;
const MASKED_ACCOUNT_RE = /(?:\*{2,}|x{3,}|•{2,})\s?(\d{4})\b/giu;
// Payee named explicitly with a label - deliberately NOT "transfer to X",
// which also matches "transfer to our new account".
const PAYEE_RE = /\b(?:beneficiary(?: name)?|account name|account holder|payee|b[ée]n[ée]ficiaire|titulaire du compte|nom du compte)\s*[:\-]\s*([\p{L}][\p{L} .'&-]{1,60}?)\s*(?:$|\n|,|;|\.\s)/imu;

export function extractAccountLast4(text) {
  const out = new Set();
  for (const m of String(text ?? "").matchAll(ACCOUNT_ENDING_RE)) out.add(m[1]);
  for (const m of String(text ?? "").matchAll(MASKED_ACCOUNT_RE)) out.add(m[1]);
  for (const m of String(text ?? "").matchAll(ACCOUNT_NUMBER_RE)) {
    const digits = m[1].replace(/\D/g, "");
    if (digits.length >= 6) out.add(digits.slice(-4));
  }
  return [...out];
}

export function extractPayee(text) {
  const m = PAYEE_RE.exec(String(text ?? ""));
  return m ? m[1].trim() : null;
}

const masked = (last4) => `****${last4}`;
const isFreemail = (domain) => Boolean(domain) && FREEMAIL_DOMAINS.has(registrableDomain(domain));

// `comparison` is the structured "why unusual" row: what we observed, what
// a trusted source says to expect, and which source that was.
function emailSignal(code, { evidence, description, variant = null, host = null, comparison = null, metadata = {} }) {
  return makeSignal(code, {
    sourceType: "rule",
    evidence,
    description,
    metadata: { detector: EMAIL_DETECTOR_VERSION, ...(variant ? { variant } : {}), ...(host ? { host } : {}), ...(comparison ? { comparison } : {}), ...metadata },
  });
}

function ownsDomain(supplier, domain) {
  return Boolean(domain) && supplier.domains.some((d) => ["same", "sibling"].includes(compareDomains(domain, d)));
}

function lookalikeOf(supplier, domain) {
  return supplier.domains.find((d) => compareDomains(domain, d) === "lookalike") ?? null;
}

/** EMAIL-01: a Reply-To on a different registrable domain than From. */
function replyToMismatch(ctx, fromDomain, supplier, orgRelation, directory) {
  if (!fromDomain) return [];
  const fromRegistrable = registrableDomain(fromDomain);
  const mismatch = ctx.replyTo.find((r) => {
    if (registrableDomain(r.domain) === fromRegistrable) return false;
    // Both on the same known party's domains (supplier or our organisation) - not a mismatch.
    if (supplier && ownsDomain(supplier, fromDomain) && ownsDomain(supplier, r.domain)) return false;
    if (orgRelation?.relation === "same" && organisationDomainRelation(r.domain, directory)?.relation === "same") return false;
    return true;
  });
  if (!mismatch) return [];
  // Same sender as earlier in the conversation, but replies now diverted:
  // the classic hijack step, stronger than a bulk mailer's Reply-To.
  const inThread = Boolean(ctx.threadContext?.previousSenders.some((p) => p.address === ctx.from.address));
  return [
    emailSignal("EMAIL-01", {
      evidence: `From ${ctx.from.address} / Reply-To ${mismatch.address}`,
      description: inThread
        ? `Replies in this ongoing conversation would now go to ${mismatch.domain}, not ${fromDomain}.`
        : `Replies to this email would go to ${mismatch.domain}, not the sender's domain ${fromDomain}.`,
      ...(inThread ? { variant: "in_thread" } : {}),
      host: mismatch.domain,
      comparison: { field: "replyToDomain", observed: mismatch.domain, expected: fromDomain, source: "email_headers" },
      metadata: { fromDomain, replyToDomain: mismatch.domain, replyToFreemail: isFreemail(mismatch.domain) },
    }),
  ];
}

/** EMAIL-03: authentication treated as contextual evidence, never as proof. */
function authenticationAnomaly(auth, { knownSenderDomain }) {
  const { spf, dkim, dmarc } = auth;
  if (dmarc === "pass") return [];
  const spfFailed = spf === "fail" || spf === "softfail";
  const dkimFailed = dkim === "fail";
  let variant = null;
  if (dmarc === "fail") variant = knownSenderDomain ? "dmarc_fail_known_domain" : "dmarc_fail";
  else if (spfFailed && dkimFailed) variant = "spf_and_dkim_fail";
  // One mechanism failing while the other passes is what forwarding looks
  // like - not an anomaly. One failing with the other unknown is weak.
  else if ((spfFailed && dkim !== "pass") || (dkimFailed && spf !== "pass")) variant = "partial_fail";
  if (!variant) return [];
  const descriptions = {
    dmarc_fail_known_domain: "DMARC failed for a domain your organisation deals with - the From address may be forged.",
    dmarc_fail: "The sender's domain did not pass DMARC authentication.",
    spf_and_dkim_fail: "Both SPF and DKIM authentication failed for this sender.",
    partial_fail: "An email authentication check failed (this can also happen with legitimate forwarding).",
  };
  return [
    emailSignal("EMAIL-03", {
      evidence: `SPF ${spf} / DKIM ${dkim} / DMARC ${dmarc}`,
      description: descriptions[variant],
      variant,
      comparison: { field: "authentication", observed: `SPF ${spf} / DKIM ${dkim} / DMARC ${dmarc}`, expected: "DMARC pass", source: "email_headers" },
      metadata: { spf, dkim, dmarc },
    }),
  ];
}

/** EMAIL-04: current sender does not match who was in this thread before. */
function threadSenderChange(ctx, fromDomain) {
  const previous = ctx.threadContext?.previousSenders;
  if (!previous?.length || !ctx.from?.address) return [];
  if (previous.some((p) => p.address === ctx.from.address)) return [];
  if (previous.some((p) => ["same", "sibling"].includes(compareDomains(fromDomain, p.domain)))) return [];
  const imitated = previous.find((p) => compareDomains(fromDomain, p.domain) === "lookalike");
  // Same display name as an earlier participant, different domain: the
  // hijacker kept the name so the change goes unnoticed.
  const currentName = nameKey(ctx.from.name);
  const sameName = !imitated && currentName ? previous.find((p) => p.name && nameKey(p.name) === currentName) : null;
  const previousDomains = [...new Set(previous.map((p) => registrableDomain(p.domain)))];
  if (!imitated && !sameName && previousDomains.length !== 1) return [];
  const previousDomain = imitated?.domain ?? sameName?.domain ?? previousDomains[0];
  const variant = imitated ? "lookalike" : sameName ? "same_name_new_domain" : "different_domain";
  const descriptions = {
    lookalike: `This reply comes from ${fromDomain}, which imitates ${previousDomain} used earlier in the conversation.`,
    same_name_new_domain: `"${ctx.from.name}" wrote earlier in this conversation from ${previousDomain}; this reply uses the same name from ${fromDomain}.`,
    different_domain: `This reply comes from ${fromDomain}; earlier messages in the conversation came from ${previousDomain}.`,
  };
  return [
    emailSignal("EMAIL-04", {
      evidence: `${ctx.from.address} (earlier in this thread: ${previousDomain})`,
      description: descriptions[variant],
      variant,
      host: fromDomain,
      comparison: { field: "conversationSender", observed: fromDomain, expected: previousDomain, ...(imitated ? { technique: impersonationTechnique(fromDomain, previousDomain) } : {}), source: "thread_history" },
      metadata: { previousDomain },
    }),
  ];
}

function classifyAttachment(att) {
  const name = att.name.toLowerCase();
  if (RTL_OVERRIDE.test(name)) return "double_extension";
  const parts = name.split(".").map((p) => p.trim());
  const ext = parts.length > 1 ? parts.at(-1) : "";
  if (parts.length >= 3 && DOCUMENT_EXTENSIONS.has(parts.at(-2)) && RISKY_EXTENSIONS.has(ext)) return "double_extension";
  if (DOCUMENT_EXTENSIONS.has(ext) && att.contentType && ACTIVE_CONTENT_TYPES.test(att.contentType)) return "type_mismatch";
  if (RISKY_EXTENSIONS.has(ext)) return "risky_type";
  return null;
}

/** EMAIL-05: metadata only - attachments are never opened, fetched or executed. */
function attachmentRisk(attachments) {
  const rank = { double_extension: 3, type_mismatch: 3, risky_type: 1 };
  let worst = null;
  for (const att of attachments) {
    const variant = classifyAttachment(att);
    if (variant && (!worst || rank[variant] > rank[worst.variant])) worst = { att, variant };
  }
  if (!worst) return [];
  const descriptions = {
    double_extension: `"${worst.att.name}" disguises its real file type with a double extension.`,
    type_mismatch: `"${worst.att.name}" is named like a document but is really ${worst.att.contentType}.`,
    risky_type: `"${worst.att.name}" is a file type that can run code or open a fake login page.`,
  };
  return [
    emailSignal("EMAIL-05", {
      evidence: worst.att.name,
      description: descriptions[worst.variant],
      variant: worst.variant,
      metadata: { contentType: worst.att.contentType, attachmentCount: attachments.length },
    }),
  ];
}

/** EMAIL-06 / EMAIL-07 / EMAIL-10 - payment facts vs the supplier's trusted record. */
function supplierPaymentChecks(supplier, { ctx, text, paymentContext, financialRequest, senderIsSupplier, registryVersion }, checks) {
  const signals = [];
  const requested = [...new Set([...extractAccountLast4(text), ...(paymentContext?.accountLast4 ? [paymentContext.accountLast4] : [])])];
  if (supplier.knownAccountLast4.length === 0) checks.bankDetails = "no_baseline_on_record";
  else if (requested.length === 0) checks.bankDetails = "no_account_in_message";
  else {
    checks.bankDetails = "compared";
    const changed = requested.find((d) => !supplier.knownAccountLast4.includes(d));
    if (changed) {
      signals.push(
        emailSignal("EMAIL-06", {
          evidence: `account ending ${changed}`,
          description: `The account in this email (${masked(changed)}) is not the account on record for ${supplier.name} (${supplier.knownAccountLast4.map(masked).join(", ")}).`,
          comparison: { field: "bankAccount", observed: masked(changed), expected: supplier.knownAccountLast4.map(masked), source: "supplier_registry" },
          metadata: { supplierId: supplier.id, requestedAccount: masked(changed), accountsOnRecord: supplier.knownAccountLast4.map(masked), demoRegistry: registryVersion },
        })
      );
    }
  }

  const payee = paymentContext?.recipient ?? extractPayee(text);
  if (supplier.knownBeneficiaries.length === 0) checks.payee = "no_baseline_on_record";
  else if (!payee) checks.payee = "no_payee_in_message";
  else {
    checks.payee = "compared";
    if (!supplier.knownBeneficiaries.some((b) => namesMatch(payee, b))) {
      signals.push(
        emailSignal("EMAIL-07", {
          evidence: payee,
          description: `Payment would go to "${payee}", not ${supplier.name}'s payee on record.`,
          comparison: { field: "beneficiary", observed: payee, expected: supplier.knownBeneficiaries, source: "supplier_registry" },
          metadata: { supplierId: supplier.id, beneficiary: payee, demoRegistry: registryVersion },
        })
      );
    }
  }

  const address = ctx.from?.address;
  if (financialRequest && senderIsSupplier && supplier.knownEmailAddresses.length > 0 && !supplier.knownEmailAddresses.includes(address)) {
    signals.push(
      emailSignal("EMAIL-10", {
        evidence: address,
        description: `${address} is not one of the addresses on record for ${supplier.name}, and it is asking about a payment.`,
        comparison: { field: "senderAddress", observed: address, expected: supplier.knownEmailAddresses, source: "supplier_registry" },
        metadata: { supplierId: supplier.id },
      })
    );
  }
  return signals;
}

/**
 * EMAIL-09 - an external sender using a directory person's name: variant
 * "executive" or "employee" by the person's role in the organisation
 * profile. (A look-alike of the organisation's own DOMAIN is ORG-01 in
 * services/org-identity; both carry the sender domain as `host`, so on one
 * email they are one finding.)
 */
function internalImpersonation(from, fromDomain, directory, checks) {
  const person = from.name ? findPersonByName(from.name, directory) : null;
  if (person) checks.directory = "compared";
  if (!person || person.emails.includes(from.address)) return null;
  return emailSignal("EMAIL-09", {
    evidence: `${from.name} <${from.address}>`,
    description: `Uses the name of ${person.name} (${person.title}), but was sent from outside the organisation (${fromDomain}).`,
    variant: person.role === "executive" ? "executive" : "employee",
    host: fromDomain,
    comparison: { field: "senderAddress", observed: from.address, expected: directory.organisationDomains, source: "organisation_directory" },
    metadata: { role: person.role, title: person.title, organisationDomains: directory.organisationDomains, freemail: isFreemail(fromDomain), demoDirectory: directory.version },
  });
}

/** EMAIL-08 - the display name contradicts the sending address. */
function displayNameMismatch(from, fromDomain) {
  const embedded = EMBEDDED_ADDRESS_RE.exec(from.name);
  const institution = findClaimedInstitution(from.name)?.institution ?? null;
  let variant = null;
  let description = null;
  if (embedded && registrableDomain(embedded[1]) !== registrableDomain(fromDomain)) {
    variant = "embedded_address";
    description = `The display name shows an address at ${embedded[1].toLowerCase()}, but the email really came from ${fromDomain}.`;
  } else if (institution && !institution.official_domains.some((d) => isOfficialHost(fromDomain, d))) {
    variant = "institution_name";
    description = `The display name says ${institution.display_name}, but the email came from ${fromDomain}, not ${institution.official_domains[0]}.`;
  } else if (EXEC_TITLE_RE.test(from.name) && isFreemail(fromDomain)) {
    variant = "title_on_freemail";
    description = `The display name uses a senior job title, but the email came from a personal ${fromDomain} address.`;
  }
  if (!variant) return null;
  return emailSignal("EMAIL-08", { evidence: `${from.name} <${from.address}>`, description, variant, host: fromDomain, metadata: { freemail: isFreemail(fromDomain) } });
}

/**
 * @param {object|null} ctx validated emailContext (services/email-context)
 * @param {{ text?: string, paymentContext?: object|null, financialRequest?: boolean,
 *   suppliers?: object, directory?: object }} [opts]
 * @returns {{ signals: object[], checks: object }} `checks` says which comparisons
 *   actually ran, so the response never implies a check that had no data.
 */
export function detectEmailSignals(ctx, { text = "", paymentContext = null, financialRequest = false, suppliers = DEMO_SUPPLIERS, directory = DEMO_ORGANISATION } = {}) {
  const checks = { supplier: "no_supplier_identified", bankDetails: "not_applicable", payee: "not_applicable", thread: "not_provided", authentication: "not_provided", directory: "not_applicable" };
  if (!ctx) return { signals: [], checks };

  const from = ctx.from;
  const fromDomain = from?.domain ?? null;
  const signals = [];

  const orgRelation = organisationDomainRelation(fromDomain, directory);
  const isInternal = orgRelation?.relation === "same";

  // Which supplier (if any) this email is about. Claimed via display name, or
  // via the subject when the sender is external; a sender domain that
  // imitates a known supplier is itself a claim.
  const bySender = findSupplierByDomain(fromDomain, suppliers);
  const byName = from?.name ? findSupplierByName(from.name, suppliers) : null;
  const bySubject = !isInternal && ctx.subject ? findSupplierByName(ctx.subject, suppliers) : null;
  const claimed = byName ?? bySubject ?? (bySender?.relation === "lookalike" ? bySender.supplier : null);
  const supplier = claimed ?? (bySender && bySender.relation !== "lookalike" ? bySender.supplier : null);
  const senderIsSupplier = Boolean(supplier && ownsDomain(supplier, fromDomain));
  if (supplier) checks.supplier = senderIsSupplier ? "sender_matches_supplier_record" : "sender_differs_from_supplier_record";

  // EMAIL-02 - claims a known supplier, sends from a domain that isn't theirs.
  const supplierMismatch = Boolean(claimed && fromDomain && !senderIsSupplier && !isInternal);
  if (supplierMismatch) {
    const imitated = lookalikeOf(claimed, fromDomain);
    const technique = claimed.domains.map((d) => impersonationTechnique(fromDomain, d)).find(Boolean) ?? null;
    // Evidence strength, strongest first: visual imitation of the supplier's
    // domain; the supplier's name inside another domain (abc-supplies-
    // payments.example); a personal mailbox; anything else.
    const variant = imitated ? "lookalike" : technique === "brand_embedded" ? "brand_embedded" : isFreemail(fromDomain) ? "freemail" : "unrelated";
    signals.push(
      emailSignal("EMAIL-02", {
        evidence: from.address,
        description: imitated
          ? `Sent from ${fromDomain}, a look-alike of ${claimed.name}'s domain ${imitated}.`
          : `Presents itself as ${claimed.name}, but was sent from ${fromDomain}, not ${claimed.domains.join(", ")}.`,
        variant,
        host: fromDomain,
        comparison: { field: "senderDomain", observed: fromDomain, expected: claimed.domains, ...(technique ? { technique } : {}), source: "supplier_registry" },
        metadata: { supplierId: claimed.id, knownDomains: claimed.domains, technique, freemail: isFreemail(fromDomain), demoRegistry: suppliers.version },
      })
    );
  }

  signals.push(...replyToMismatch(ctx, fromDomain, supplier, orgRelation, directory));

  if (ctx.authenticationSupplied) {
    checks.authentication = "evaluated";
    signals.push(...authenticationAnomaly(ctx.authentication, { knownSenderDomain: senderIsSupplier || isInternal }));
  }

  if (ctx.threadContext) {
    checks.thread = "compared";
    signals.push(...threadSenderChange(ctx, fromDomain));
  }

  signals.push(...attachmentRisk(ctx.attachments));

  if (supplier) {
    signals.push(...supplierPaymentChecks(supplier, { ctx, text, paymentContext, financialRequest, senderIsSupplier, registryVersion: suppliers.version }, checks));
  }

  const impersonation = fromDomain && !isInternal ? internalImpersonation(from, fromDomain, directory, checks) : null;
  if (impersonation) signals.push(impersonation);
  // A look-alike of our own domain is ORG-01's fact (services/org-identity).
  const imitatesOrganisation = orgRelation?.relation === "lookalike" && orgRelation.technique !== "brand_embedded";

  // EMAIL-08 only when the supplier / directory / organisation-domain checks
  // did not already report this same identity fact.
  if (from?.name && fromDomain && !supplierMismatch && !impersonation && !imitatesOrganisation) {
    const mismatch = displayNameMismatch(from, fromDomain);
    if (mismatch) signals.push(mismatch);
  }

  return { signals, checks };
}
