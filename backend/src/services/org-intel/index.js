// Non-LLM, deterministic ORGANISATION INTELLIGENCE for workplace email:
//   ORG-05  earlier email sharing this sender / domain / indicator was
//           confirmed as fraud by the organisation's analysts
//   ORG-06  this email is part of a campaign targeting the organisation:
//           several flagged emails share a REAL indicator
// plus the history / reputation data behind "why unusual".
//
// Campaigns are clustered ONLY on shared technical indicators - never on the
// brand or person an email claims to be (display name, supplier name,
// subject). Indicators (see extractIndicators):
//   sender_domain / reply_domain  registrable domain of From / Reply-To
//                                 (a personal mailbox uses a pseudonymous
//                                 address key instead: gmail.com is not a campaign)
//   link                          registrable domain of a link
//   account                       last-4 of a bank account the email asks to pay
//   payee                         a labelled beneficiary name
//   attachment                    a risky attachment's name pattern
// Our own domains, known suppliers' domains, official institution domains,
// shorteners and accounts / payees on record are never indicators.
//
// Rule org-campaign-1.0: an indicator shared by >= 3 flagged emails
// (including this one) within 14 days, counted once per distinct email, with
// either >= 2 distinct recipients, >= 2 distinct senders, or a strong
// indicator type (account, payee, link). Emails an analyst labelled
// legitimate / false_positive are excluded. A campaign id is a hash of
// (organisation, indicator), so it is stable across calls.

import { createHash, createHmac, randomBytes } from "node:crypto";
import { templateHash, templateTokens } from "../community-signals/fingerprint.js";
import { extractLinks, registrableDomain, SHORTENER_HOSTS } from "../domain-matching/index.js";
import { institutionForHost } from "../institutions/index.js";
import { makeSignal } from "../signals/registry.js";
import { extractAccountLast4, extractPayee, FREEMAIL_DOMAINS } from "../email-signals/index.js";
import { namesMatch } from "../payment-context/index.js";
import { DEMO_ORGANISATION, DEMO_SUPPLIERS, nameKey, organisationDomainRelation, findSupplierByDomain } from "../workplace-registry/index.js";
import {
  getFlaggedIndicatorRows,
  getDomainReputation,
  getIndicatorEmails,
  getIndicatorPeers,
  getOrgObservation,
  getOrgOutcomes,
  getSenderPeers,
  recordOrgObservation,
  upsertOrgOutcome,
} from "../../db/org.js";

export const CAMPAIGN_RULES = Object.freeze({
  version: "org-campaign-1.0",
  windowDays: 14,
  minMessages: 3,
  strongTypes: Object.freeze(["account", "payee", "link"]),
});
export const OUTCOME_LABELS = Object.freeze([
  "confirmed_phishing", "confirmed_bec", "supplier_impersonation",
  "false_positive", "legitimate", "insufficient_evidence",
  // Kept for compatibility with the partially implemented service.
  "confirmed_fraud", "suspicious_unconfirmed",
]);
const BENIGN_LABELS = new Set(["legitimate", "false_positive"]);
const FRAUD_LABELS = new Set(["confirmed_fraud", "confirmed_phishing", "confirmed_bec", "supplier_impersonation"]);
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INDICATORS = 20;

const PSEUDONYM_SECRET = process.env.ORG_PSEUDONYM_SECRET || randomBytes(32).toString("hex");
if (!process.env.ORG_PSEUDONYM_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[org-intel] ORG_PSEUDONYM_SECRET not set - sender history and analyst outcomes reset on every restart");
}

/** HMAC pseudonym of an address / analyst id, scoped to the organisation. Raw values are never stored. */
export function pseudonym(orgId, value) {
  if (!value) return null;
  return createHmac("sha256", PSEUDONYM_SECRET).update(`${orgId}\u0000${String(value).toLowerCase()}`).digest("hex").slice(0, 32);
}

/** Stable duplicate key without storing a raw Message-ID or recipient. */
export function observationId({ orgId, inputHash, messageId, recipientKey }) {
  const messageKey = messageId ? pseudonym(orgId, messageId) : "no-message-id";
  return createHash("sha256").update(`${orgId}\u0000${messageKey}\u0000${inputHash}\u0000${recipientKey ?? ""}`).digest("hex");
}

function maskAddress(address) {
  const [local, domain] = address.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

const isFreemail = (domain) => FREEMAIL_DOMAINS.has(registrableDomain(domain));

/** A domain that can never be a campaign indicator (ours, a known supplier's, an institution's, a shortener). */
function isTrustedOrGeneric(domain, profile, suppliers) {
  if (!domain) return true;
  if (organisationDomainRelation(domain, profile)?.relation === "same") return true;
  const supplier = findSupplierByDomain(domain, suppliers);
  if (supplier && supplier.relation !== "lookalike") return true;
  return Boolean(institutionForHost(domain)) || SHORTENER_HOSTS.includes(registrableDomain(domain));
}

/**
 * Shared-indicator keys for one email. Pure.
 * @returns {{ key: string, type: string, display: string }[]}
 */
export function extractIndicators(ctx, { text = "", paymentContext = null, signals = [], profile = DEMO_ORGANISATION, suppliers = DEMO_SUPPLIERS } = {}) {
  if (!ctx) return [];
  const out = new Map();
  const add = (type, value, display = value) => {
    if (value && out.size < MAX_INDICATORS) out.set(`${type}:${value}`, { key: `${type}:${value}`, type, display });
  };
  const mailbox = (type, m) => {
    if (!m?.domain || isTrustedOrGeneric(m.domain, profile, suppliers)) return;
    if (isFreemail(m.domain)) add(`${type}_address`, pseudonym(profile.organisationId, m.address), maskAddress(m.address));
    else add(`${type}_domain`, registrableDomain(m.domain));
  };

  mailbox("sender", ctx.from);
  const fromRegistrable = ctx.from?.domain ? registrableDomain(ctx.from.domain) : null;
  for (const r of ctx.replyTo) if (registrableDomain(r.domain) !== fromRegistrable) mailbox("reply", r);

  const hosts = [...extractLinks(text).map((l) => l.host), ...ctx.urls.flatMap((u) => extractLinks(u).map((l) => l.host))];
  for (const host of hosts) if (!isTrustedOrGeneric(host, profile, suppliers)) add("link", registrableDomain(host));

  const onRecord = new Set(suppliers.suppliers.flatMap((s) => s.knownAccountLast4));
  for (const last4 of [...extractAccountLast4(text), ...(paymentContext?.accountLast4 ? [paymentContext.accountLast4] : [])]) {
    if (!onRecord.has(last4)) add("account", last4, `****${last4}`);
  }

  const payee = paymentContext?.recipient ?? extractPayee(text);
  const knownPayees = suppliers.suppliers.flatMap((s) => s.knownBeneficiaries);
  if (payee && !knownPayees.some((b) => namesMatch(payee, b))) add("payee", nameKey(payee), payee);

  const risky = signals.find((s) => s.code === "EMAIL-05");
  if (risky?.evidence) add("attachment", risky.evidence.toLowerCase().replace(/\d+/g, "#"));
  // A non-reversible normalized template is a concrete shared indicator;
  // unlike a claimed brand/name it only matches materially similar content.
  if (templateTokens(text).length >= 5) add("template", templateHash(text), "matching message template");
  return [...out.values()];
}

/** Majority label per email; a tie goes to the most recent vote. */
export function consensusLabels(rows) {
  const byHash = new Map();
  for (const r of rows) {
    if (!byHash.has(r.input_hash)) byHash.set(r.input_hash, []);
    byHash.get(r.input_hash).push(r);
  }
  const out = new Map();
  for (const [hash, votes] of byHash) {
    const counts = new Map();
    for (const v of votes) counts.set(v.label, (counts.get(v.label) ?? 0) + 1);
    const top = Math.max(...counts.values());
    const tied = votes.filter((v) => counts.get(v.label) === top).sort((a, b) => b.created_at.localeCompare(a.created_at));
    out.set(hash, { label: tied[0].label, votes: votes.length });
  }
  return out;
}

const campaignId = (orgId, key) => `OC-${createHash("sha256").update(`${orgId}\u0000${key}`).digest("hex").slice(0, 12)}`;

function summariseCampaigns(orgId, rows, current = null) {
  const benign = consensusLabels(getOrgOutcomes(orgId, [...new Set(rows.map((r) => r.input_hash))]));
  const groups = new Map();
  for (const r of rows) {
    if (BENIGN_LABELS.has(benign.get(r.input_hash)?.label)) continue;
    if (!groups.has(r.indicator)) groups.set(r.indicator, { messages: new Set(), senders: new Set(), recipients: new Set(), first: r.created_at, last: r.created_at });
    const g = groups.get(r.indicator);
    g.messages.add(r.input_hash);
    if (r.sender_key) g.senders.add(r.sender_key);
    if (r.recipient_key) g.recipients.add(r.recipient_key);
    if (r.created_at < g.first) g.first = r.created_at;
    if (r.created_at > g.last) g.last = r.created_at;
  }
  const out = [];
  for (const [indicator, g] of groups) {
    if (current) {
      g.messages.add(current.inputHash);
      if (current.senderKey) g.senders.add(current.senderKey);
      if (current.recipientKey) g.recipients.add(current.recipientKey);
      g.last = current.nowIso;
    }
    const type = indicator.slice(0, indicator.indexOf(":"));
    const companyWide = g.recipients.size >= 2 || g.senders.size >= 2 || CAMPAIGN_RULES.strongTypes.includes(type);
    if (g.messages.size < CAMPAIGN_RULES.minMessages || !companyWide) continue;
    out.push({
      campaignId: campaignId(orgId, indicator),
      indicator,
      indicatorType: type,
      messages: g.messages.size,
      senders: g.senders.size,
      recipients: g.recipients.size,
      firstSeen: g.first,
      lastSeen: g.last,
      rulesVersion: CAMPAIGN_RULES.version,
    });
  }
  return out.sort((a, b) => b.messages - a.messages || a.indicator.localeCompare(b.indicator));
}

function campaignSignal(best, indicators) {
  const shown = indicators.find((i) => i.key === best.indicator)?.display ?? best.indicator;
  return makeSignal("ORG-06", {
    sourceType: "community",
    evidence: `${best.indicatorType}: ${shown}`,
    description: `${best.messages} flagged emails to your organisation in the last ${CAMPAIGN_RULES.windowDays} days share the same ${best.indicatorType.replace("_", " ")} (${shown}).`,
    metadata: {
      ...best,
      indicatorDisplay: shown,
      comparison: {
        field: "campaign",
        observed: `${best.indicatorType} ${shown} seen in ${best.messages} flagged emails (${best.recipients} recipients, ${best.senders} senders)`,
        expected: "a one-off email",
        source: "organisation_observations",
      },
    },
  });
}

function reputationSignal(variant, count, detail) {
  const what = { sender: "this sender", indicator: `this ${detail}`, domain: "this sender's domain" }[variant];
  return makeSignal("ORG-05", {
    sourceType: "intel",
    evidence: variant === "indicator" ? detail : variant,
    description: `Your organisation's analysts confirmed ${count} earlier email${count === 1 ? "" : "s"} involving ${what} as fraud.`,
    metadata: {
      variant,
      confirmedFraudEmails: count,
      comparison: { field: "analystOutcome", observed: `${count} confirmed-fraud email(s) involving ${what}`, expected: "no confirmed fraud", source: "analyst_outcomes" },
    },
  });
}

/**
 * Reads the organisation store: campaign (ORG-06), confirmed-fraud
 * reputation (ORG-05) and sender history. Never writes.
 */
export function evaluateOrgIntel({ orgId, inputHash, indicators, senderKey, recipientKey, senderDomain, flagged = false, now = Date.now() }) {
  const nowIso = new Date(now).toISOString();
  const sinceIso = new Date(now - CAMPAIGN_RULES.windowDays * DAY_MS).toISOString();
  const keys = indicators.map((i) => i.key);
  const signals = [];

  const peers = getIndicatorPeers(orgId, keys, sinceIso, inputHash).filter((r) => r.flagged === 1);
  const campaigns = summariseCampaigns(orgId, peers, flagged ? { inputHash, senderKey, recipientKey, nowIso } : null);
  if (campaigns.length) signals.push(campaignSignal(campaigns[0], indicators));

  // Reputation from analyst outcomes, each email counted once.
  const senderRows = getSenderPeers(orgId, { senderKey, senderDomain }, inputHash);
  const indicatorRows = getIndicatorEmails(orgId, keys.filter((k) => !k.startsWith("sender_")), inputHash);
  const labels = consensusLabels(getOrgOutcomes(orgId, [...new Set([...senderRows, ...indicatorRows].map((r) => r.input_hash))]));
  const fraud = (hash) => FRAUD_LABELS.has(labels.get(hash)?.label);
  const bySender = senderRows.filter((r) => senderKey && r.sender_key === senderKey);
  const byDomain = senderRows.filter((r) => senderDomain && r.sender_domain === senderDomain);
  const senderFraud = new Set(bySender.filter((r) => fraud(r.input_hash)).map((r) => r.input_hash)).size;
  const domainFraud = new Set(byDomain.filter((r) => fraud(r.input_hash)).map((r) => r.input_hash)).size;
  const indicatorFraud = new Map();
  for (const r of indicatorRows) if (fraud(r.input_hash)) indicatorFraud.set(r.indicator, (indicatorFraud.get(r.indicator) ?? new Set()).add(r.input_hash));

  if (senderFraud > 0) signals.push(reputationSignal("sender", senderFraud));
  else if (indicatorFraud.size > 0) {
    const [key, hashes] = [...indicatorFraud].sort((a, b) => b[1].size - a[1].size)[0];
    const ind = indicators.find((i) => i.key === key);
    signals.push(reputationSignal("indicator", hashes.size, `${ind.type.replace("_", " ")} ${ind.display}`));
  } else if (domainFraud > 0) signals.push(reputationSignal("domain", domainFraud));

  const firstSeen = bySender.reduce((min, r) => (!min || r.created_at < min ? r.created_at : min), null);
  return {
    signals,
    campaigns,
    reputation: {
      senderConfirmedFraud: senderFraud,
      domainConfirmedFraud: domainFraud,
      senderConfirmedLegitimate: new Set(bySender.filter((r) => BENIGN_LABELS.has(labels.get(r.input_hash)?.label)).map((r) => r.input_hash)).size,
      domain: getDomainReputation(orgId, senderDomain),
    },
    history: { previousEmailsFromSender: new Set(bySender.map((r) => r.input_hash)).size, firstSeen },
  };
}

/** Stores the observation. Indicators are kept for every email (so analysts can label misses) but only `flagged` ones feed campaigns. */
export function recordOrgEmail({ orgId, inputHash, senderKey, senderDomain, recipientKey, level, flagged, indicators, now = Date.now() }) {
  return recordOrgObservation({
    orgId, inputHash, senderKey, senderDomain, recipientKey, level, flagged,
    createdAt: new Date(now).toISOString(),
    indicators: indicators.map((i) => i.key),
  });
}

/**
 * Analyst outcome label for an email the organisation already analysed.
 * One label per analyst per email (a later label replaces the earlier one).
 * @returns {{ error: "invalid_label"|"not_found" } | { inputHash, label, consensus, votes }}
 */
export function recordOutcome({ orgId, inputHash, analystId, label, now = Date.now() }) {
  if (!OUTCOME_LABELS.includes(label)) return { error: "invalid_label" };
  if (!getOrgObservation(orgId, inputHash)) return { error: "not_found" };
  upsertOrgOutcome({ orgId, inputHash, analystKey: pseudonym(orgId, analystId || "anonymous"), label, createdAt: new Date(now).toISOString() });
  const consensus = consensusLabels(getOrgOutcomes(orgId, [inputHash])).get(inputHash);
  return { inputHash, label, consensus: consensus.label, votes: consensus.votes };
}

/** Active campaigns for the organisation (analyst view). */
export function listCampaigns(orgId, now = Date.now()) {
  const sinceIso = new Date(now - CAMPAIGN_RULES.windowDays * DAY_MS).toISOString();
  return summariseCampaigns(orgId, getFlaggedIndicatorRows(orgId, sinceIso));
}
