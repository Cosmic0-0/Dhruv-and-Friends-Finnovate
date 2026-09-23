// Non-LLM, deterministic ORGANISATION-IDENTITY detectors for workplace email:
//   ORG-01  the sender's domain imitates the organisation's own domain
//   ORG-02  a Reply-To or link imitates the organisation's own domain
//           (fake login page, replies diverted to a look-alike)
//   ORG-03  an external sender poses as an internal function (finance,
//           payroll, IT) from the organisation profile
//   ORG-04  first contact from this sender (only when the email client
//           supplied sender history - never inferred)
// plus PAY-07 (variant "payroll") for salary-account change requests.
//
// Input: validated emailContext, the analysis text, the organisation
// profile (services/workplace-registry). Output: registry signals, each with
// `metadata.comparison` = the structured "why unusual" row (observed vs
// expected + where "expected" came from). No scoring, no LLM, no I/O.
//
// Demo note: with the aspire.mu profile, asp1re.mu / a.spire.mu /
// aspire.mu.verify-login.com / Cyrillic аspire.mu each show their technique
// ("confusable", "label_split", "subdomain_abuse", "homoglyph") in
// metadata.technique - that is what the UI shows next to "Why unusual".

import { extractLinks, registrableDomain } from "../domain-matching/index.js";
import { institutionForHost } from "../institutions/index.js";
import { makeSignal } from "../signals/registry.js";
import { FREEMAIL_DOMAINS } from "../email-signals/index.js";
import { DEMO_ORGANISATION, DEMO_SUPPLIERS, findRoleClaim, findSupplierByDomain, mentionsOrganisation, organisationDomainRelation } from "../workplace-registry/index.js";

export const ORG_DETECTOR_VERSION = "org-identity-1.0";

// Label parts that turn "brand inside a longer domain" from a coincidence
// (aspire-events.com) into a lure (aspire-login.com).
const LURE_TOKENS = new Set([
  "login", "logon", "signin", "sso", "auth", "secure", "security", "verify", "verification", "account", "accounts", "portal", "mail",
  "webmail", "outlook", "office", "o365", "m365", "helpdesk", "support", "it", "hr", "payroll", "pay", "payment", "payments", "finance",
  "invoice", "billing", "update", "reset", "password", "admin", "service", "desk",
]);
const MAX_LINK_SIGNALS = 3;
const FIRST_SEEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const PAYROLL_CHANGE_RES = [
  { lang: "en", re: /\b(?:update|change|switch|amend|replace)\b[^.\n]{0,40}?\b(?:salary|payroll|direct deposit|wages?|pay)\b[^.\n]{0,25}?\b(?:account|bank|details)\b|\bnew (?:salary|payroll) account\b/iu },
  { lang: "fr", re: /\b(?:changer|modifier|mettre [àa] jour)\b[^.\n]{0,40}?\b(?:compte (?:de )?salaire|virement (?:de|du) salaire|coordonn[ée]es bancaires)\b/iu },
  { lang: "mfe", re: /\bsanz(?:e)?\b[^.\n]{0,20}?\bkont (?:la paye|salair|pou mo salair)\b/iu },
];

const isFreemail = (domain) => Boolean(domain) && FREEMAIL_DOMAINS.has(registrableDomain(domain));

function hasLureToken(domain) {
  return registrableDomain(domain)
    .split(".")[0]
    .split("-")
    .some((part) => LURE_TOKENS.has(part));
}

/** Organisation look-alike relation that is strong enough to report. */
function orgImitation(domain, profile, { claimsOrganisation = false } = {}) {
  const rel = organisationDomainRelation(domain, profile);
  if (rel?.relation !== "lookalike") return null;
  // brand_embedded alone is too common a coincidence for a dictionary-word brand.
  if (rel.technique === "brand_embedded" && !hasLureToken(domain) && !claimsOrganisation) return null;
  return rel;
}

function orgSignal(code, { evidence, description, variant, host, comparison, metadata = {}, sourceType = "rule" }) {
  return makeSignal(code, {
    sourceType,
    evidence,
    description,
    metadata: { detector: ORG_DETECTOR_VERSION, ...(variant ? { variant } : {}), ...(host ? { host } : {}), ...(comparison ? { comparison } : {}), ...metadata },
  });
}

function senderImitation(from, fromDomain, profile, claimsOrganisation) {
  const rel = orgImitation(fromDomain, profile, { claimsOrganisation });
  if (!rel) return null;
  return orgSignal("ORG-01", {
    evidence: from.address,
    description: `Sent from ${fromDomain}, which imitates your organisation's domain ${rel.trustedDomain} (${rel.technique.replace("_", " ")}).`,
    variant: rel.technique,
    host: fromDomain,
    comparison: { field: "senderDomain", observed: fromDomain, expected: profile.organisationDomains, technique: rel.technique, source: "organisation_profile" },
    metadata: { technique: rel.technique, protectedDomain: rel.trustedDomain, profile: profile.version },
  });
}

function replyToImitations(ctx, profile, seenHosts) {
  const out = [];
  for (const r of ctx.replyTo) {
    if (seenHosts.has(r.domain)) continue;
    const rel = orgImitation(r.domain, profile);
    if (!rel) continue;
    seenHosts.add(r.domain);
    out.push(
      orgSignal("ORG-02", {
        evidence: r.address,
        description: `Replies would go to ${r.domain}, which imitates your organisation's domain ${rel.trustedDomain}.`,
        variant: "reply_to",
        host: r.domain,
        comparison: { field: "replyToDomain", observed: r.domain, expected: profile.organisationDomains, technique: rel.technique, source: "organisation_profile" },
        metadata: { technique: rel.technique, protectedDomain: rel.trustedDomain },
      })
    );
  }
  return out;
}

function linkImitations(text, urls, profile, seenHosts) {
  const hosts = [...extractLinks(text).map((l) => l.host), ...urls.flatMap((u) => extractLinks(u).map((l) => l.host))];
  const out = [];
  for (const host of hosts) {
    if (out.length >= MAX_LINK_SIGNALS || seenHosts.has(host) || institutionForHost(host)) continue;
    const rel = orgImitation(host, profile);
    if (!rel) continue;
    seenHosts.add(host);
    out.push(
      orgSignal("ORG-02", {
        evidence: host,
        description: `A link goes to ${host}, which imitates your organisation's domain ${rel.trustedDomain} - a typical fake login page.`,
        variant: "link",
        host,
        comparison: { field: "linkDomain", observed: host, expected: profile.organisationDomains, technique: rel.technique, source: "organisation_profile" },
        metadata: { technique: rel.technique, protectedDomain: rel.trustedDomain },
      })
    );
  }
  return out;
}

/** ORG-03 - an outsider presenting as our finance / payroll / IT function. */
function roleImpersonation(from, fromDomain, profile, suppliers, { claimsOrganisation, imitatesOrg }) {
  const byName = from.name ? findRoleClaim(from.name, profile) : null;
  const byLocal = profile.roleMailboxes.find((r) => r.addresses.some((a) => a.split("@")[0] === from.local));
  const role = byName ?? (byLocal ? { function: byLocal.function, label: `${from.local}@`, addresses: byLocal.addresses } : null);
  if (!role) return null;
  // A supplier's own "Accounts" team writing from the supplier's real domain is normal.
  const supplier = findSupplierByDomain(fromDomain, suppliers);
  if (supplier && supplier.relation !== "lookalike") return null;
  // Needs a reason to believe it claims to be OUR function, not any company's.
  if (!(claimsOrganisation || imitatesOrg || isFreemail(fromDomain) || (byLocal && byName))) return null;
  return orgSignal("ORG-03", {
    evidence: `${from.name ?? ""} <${from.address}>`.trim(),
    description: `Presents itself as your organisation's ${role.function} function ("${role.label}"), but was sent from outside the organisation (${fromDomain}).`,
    variant: role.function,
    host: fromDomain,
    comparison: { field: "senderAddress", observed: from.address, expected: role.addresses.length ? role.addresses : profile.organisationDomains, source: "organisation_profile" },
    metadata: { function: role.function, freemail: isFreemail(fromDomain) },
  });
}

/** ORG-04 - client-supplied history says this sender has never written before. */
function firstContact(ctx, now) {
  const sc = ctx.senderContext;
  if (!sc) return null;
  const firstSeenMs = sc.firstSeenAt ? Date.parse(sc.firstSeenAt) : NaN;
  const isFirst = sc.previousMessageCount === 0 || (Number.isFinite(firstSeenMs) && now - firstSeenMs >= 0 && now - firstSeenMs < FIRST_SEEN_WINDOW_MS);
  if (!isFirst) return null;
  const observed = sc.previousMessageCount === 0 ? "no earlier messages from this sender" : `first seen ${new Date(firstSeenMs).toISOString().slice(0, 10)}`;
  return orgSignal("ORG-04", {
    evidence: ctx.from.address,
    description: "This is the first time this sender has written to this mailbox.",
    comparison: { field: "senderHistory", observed, expected: "a sender with prior correspondence", source: "email_client_history" },
    metadata: { previousMessageCount: sc.previousMessageCount ?? null, firstSeenAt: sc.firstSeenAt ?? null },
  });
}

function payrollChange(text) {
  for (const { lang, re } of PAYROLL_CHANGE_RES) {
    const m = re.exec(text);
    if (!m) continue;
    return makeSignal("PAY-07", {
      sourceType: "lexicon",
      evidence: m[0],
      span: [m.index, m.index + m[0].length],
      description: "Asks to change the bank account a salary is paid into.",
      metadata: { variant: "payroll", lang, detector: ORG_DETECTOR_VERSION },
    });
  }
  return null;
}

/**
 * @param {object|null} ctx validated emailContext
 * @param {{ text?: string, profile?: object, suppliers?: object, now?: number }} [opts]
 * @returns {{ signals: object[], senderRelation: "internal"|"external"|"impersonation"|"unknown" }}
 */
export function detectOrgSignals(ctx, { text = "", profile = DEMO_ORGANISATION, suppliers = DEMO_SUPPLIERS, now = Date.now() } = {}) {
  if (!ctx) return { signals: [], senderRelation: "unknown" };
  const signals = [];
  const from = ctx.from;
  const fromDomain = from?.domain ?? null;
  const rel = organisationDomainRelation(fromDomain, profile);
  const isInternal = rel?.relation === "same";
  const claimsOrganisation = Boolean(from?.name && mentionsOrganisation(from.name, profile));
  const seenHosts = new Set();

  let senderRelation = fromDomain ? (isInternal ? "internal" : "external") : "unknown";
  if (fromDomain && !isInternal) {
    const imitation = senderImitation(from, fromDomain, profile, claimsOrganisation);
    if (imitation) {
      signals.push(imitation);
      seenHosts.add(fromDomain);
      senderRelation = "impersonation";
    }
    const role = roleImpersonation(from, fromDomain, profile, suppliers, { claimsOrganisation, imitatesOrg: Boolean(imitation) });
    if (role) {
      signals.push(role);
      senderRelation = "impersonation";
    }
    const first = firstContact(ctx, now);
    if (first) signals.push(first);
  }
  signals.push(...replyToImitations(ctx, profile, seenHosts));
  signals.push(...linkImitations(text, ctx.urls, profile, seenHosts));
  const payroll = payrollChange(text);
  if (payroll) signals.push(payroll);
  return { signals, senderRelation };
}
