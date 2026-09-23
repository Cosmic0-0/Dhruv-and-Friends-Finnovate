// Community cluster/wave evidence: records scam reports as timestamped,
// privacy-minimised events and, on each analysis, checks whether the
// message belongs to a pattern that many distinct people have reported
// recently. If so, it emits ONE structured, evidence-backed REP-01/REP-02
// signal; the deterministic risk engine decides what it is worth, and the
// contribution is written to the audit log. See README.md in this directory
// for the full rule set and the compliance controls.
//
// Reliability (root CLAUDE.md "Judging Priorities"): everything here is
// best-effort enrichment. evaluateCommunitySignal() and
// recordCommunityOutcome() never throw - on any failure they log and return
// "no community evidence", so a DB problem can never fail /api/analyze.

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { redact } from "../redact/index.js";
import { BRAND_TOKENS, extractHostnames, extractLookalikeHosts } from "../domain-matching/index.js";
import { institutionForHost } from "../institutions/index.js";
import { makeSignal } from "../signals/registry.js";
import {
  normalizeSender,
  insertReportEvent,
  getReportEventsSince,
  insertRiskAudit,
  purgeCommunityData,
} from "../../db/index.js";
import { fingerprintMessage } from "./fingerprint.js";
import { ACTIVE_RULES, evaluateCommunityEvidence, buildCommunitySignal, hasDeterministicHighSignal } from "./wave.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const EVENT_RETENTION_DAYS = Number(process.env.COMMUNITY_EVENT_RETENTION_DAYS) || 90;
const AUDIT_RETENTION_DAYS = Number(process.env.COMMUNITY_AUDIT_RETENTION_DAYS) || 180;
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_WINDOW_MS =
  (ACTIVE_RULES.lookbackDays + ACTIVE_RULES.baselineDays) * DAY_MS + ACTIVE_RULES.burstWindowHours * 60 * 60 * 1000;

// Pseudonymisation key for reporter identity. Without a configured secret a
// random per-process key is used: still unlinkable to a raw IP, but
// distinct-reporter counts reset on restart - fine for a demo, not for prod.
const REPORTER_SECRET = process.env.REPORTER_HASH_SECRET || randomBytes(32).toString("hex");
if (!process.env.REPORTER_HASH_SECRET && process.env.NODE_ENV === "production") {
  console.warn("[community-signals] REPORTER_HASH_SECRET not set - reporter pseudonyms reset on every restart");
}

/** HMAC-SHA256 pseudonym of the client address. The raw IP is never stored. */
export function reporterHash(ip) {
  return createHmac("sha256", REPORTER_SECRET).update(String(ip || "unknown")).digest("hex").slice(0, 32);
}

// Official institution names/IDs. A scam that CLAIMS to be "MCB" must never
// accumulate reports against "MCB" itself - that would make every genuine
// MCB message look community-flagged (reputation poisoning of the brand).
const OFFICIAL_IDENTITY_ALIASES = new Set([
  ...BRAND_TOKENS,
  "mauritiuscommercialbank",
  "statebankofmauritius",
  "absamauritius",
  "absabank",
  "mauritiustelecom",
  "mauritiusrevenueauthority",
]);
const REDACTED_PLACEHOLDER_RE = /\[(?:phone|email|account|redacted)/i;

export function isOfficialIdentity(raw) {
  return OFFICIAL_IDENTITY_ALIASES.has(String(raw).toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/**
 * The DB key a sender may be tracked under for community reputation, or
 * null when it must not be: blank, a redaction placeholder like "[phone 1]"
 * (which normalizeSender() would otherwise collapse to "2301" - one shared
 * bucket for every redacted number), or an official institution identity.
 */
export function communitySenderKey(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (REDACTED_PLACEHOLDER_RE.test(raw) || isOfficialIdentity(raw)) return null;
  const key = normalizeSender(raw);
  return key === "" ? null : key;
}

function buildCandidate(redactedText, sender) {
  return {
    ...fingerprintMessage(redactedText),
    senderKey: communitySenderKey(sender),
    lookalikeHosts: extractLookalikeHosts(redactedText),
  };
}

// A message whose every link is an official domain is never boosted by
// crowd evidence, however often it was reported: that's the signature of a
// genuine institution message being mass-reported, not of a scam.
function linksOnlyOfficialDomains(text) {
  const hosts = extractHostnames(text);
  return hosts.length > 0 && hosts.every((h) => institutionForHost(h) !== null);
}

/**
 * Records an explicit user report (POST /api/report) as an evidence event.
 * @returns {number|null} event id, or null when there's nothing matchable
 */
export function recordUserReport({ sender, message, ip, now = Date.now(), channel = "api_report" }) {
  const text = typeof message === "string" && message.trim() !== "" ? redact(message).redacted : "";
  const senderKey = communitySenderKey(sender);
  if (!text && !senderKey) return null;
  const fp = text ? fingerprintMessage(text) : { templateHash: "", simhash: "0".repeat(16), tokenCount: 0 };
  return insertReportEvent({
    createdAt: new Date(now).toISOString(),
    origin: "user_report",
    senderKey,
    ...fp,
    lookalikeHosts: text ? extractLookalikeHosts(text) : [],
    reporterHash: reporterHash(ip),
    evidence: { channel, hasMessage: Boolean(text) },
  });
}

function recordAutoEvent(signals, candidate, ip, now) {
  const identitySignal = signals.find((s) => s.code === "ID-01" || s.code === "ID-02");
  insertReportEvent({
    createdAt: new Date(now).toISOString(),
    origin: "auto_high_confidence",
    ...candidate,
    brandClaimed: identitySignal?.claimedIdentity?.toLowerCase() ?? null,
    reporterHash: reporterHash(ip),
    evidence: {
      deterministicSignals: signals.filter((s) => s.sourceType === "rule").map((s) => s.code),
    },
  });
}

/**
 * Read-only evaluation of community cluster/wave evidence for a message.
 * Returns a REP-01/REP-02 registry signal when a tier fires - the risk
 * engine decides its points; nothing here touches a score or a verdict.
 * Never throws: any failure degrades to "no community signal".
 * @returns {{ signal: object|null, candidate: object|null, evaluation?: object, evidenceEventIds?: number[] }}
 */
export function evaluateCommunitySignal(message, { sender, now = Date.now() } = {}) {
  try {
    const text = redact(message).redacted;
    const candidate = buildCandidate(text, sender);
    // A message whose every link is an official domain is never boosted by
    // crowd evidence: that's a genuine institution message being
    // mass-reported, not a scam.
    if (linksOnlyOfficialDomains(text)) return { signal: null, candidate };
    const events = getReportEventsSince(new Date(now - FETCH_WINDOW_MS).toISOString());
    const evaluation = evaluateCommunityEvidence(candidate, events, now);
    if (!evaluation) return { signal: null, candidate };
    const built = buildCommunitySignal(evaluation);
    const signal = makeSignal(built.code, {
      sourceType: "community",
      description: built.description,
      metadata: { ruleId: evaluation.tier.ruleId, rulesVersion: evaluation.rulesVersion, evidenceCount: built.evidenceEventIds.length },
      extra: { communityEvidence: built.communityEvidence },
    });
    return { signal, candidate, evaluation, evidenceEventIds: built.evidenceEventIds };
  } catch (err) {
    console.error(`[community-signals] skipped: ${err.message}`);
    return { signal: null, candidate: null };
  }
}

/**
 * After the deterministic decision: writes the audit row for a community
 * contribution (rule, versions, evidence ids, level with and without it)
 * and, when a HIGH/CRITICAL decision is corroborated by a deterministic
 * impersonation finding, records this analysis as half-weight machine
 * evidence. Order matters: the caller evaluates BEFORE this runs, so a
 * message is never evidence for itself. Never throws.
 * @returns {{ riskAdjustment?: object }}
 */
export function recordCommunityOutcome({ community, signals, decision, levelWithoutCommunity, ip, now = Date.now() }) {
  const out = {};
  try {
    if (community?.signal && community.evaluation) {
      const { evaluation, signal, evidenceEventIds } = community;
      const auditRef = randomUUID();
      const points = decision.trace.find((t) => t.id === signal.code)?.points ?? 0;
      const { evidenceIds, ...metrics } = evaluation.metrics;
      insertRiskAudit({
        id: auditRef,
        createdAt: new Date(now).toISOString(),
        ruleId: evaluation.tier.ruleId,
        rulesVersion: `${evaluation.rulesVersion}+${decision.rulesetVersion}`,
        riskDelta: points,
        verdictFrom: levelWithoutCommunity,
        verdictTo: decision.level,
        evidenceEventIds,
        metrics,
      });
      out.riskAdjustment = {
        ruleId: evaluation.tier.ruleId,
        rulesVersion: evaluation.rulesVersion,
        signalCode: signal.code,
        points,
        levelFrom: levelWithoutCommunity,
        levelTo: decision.level,
        evidenceCount: evidenceEventIds.length,
        auditRef,
      };
    }
    const decisive = decision.level === "high" || decision.level === "critical";
    if (community?.candidate && decisive && hasDeterministicHighSignal(signals)) {
      recordAutoEvent(signals, community.candidate, ip, now);
    }
  } catch (err) {
    console.error(`[community-signals] outcome not recorded: ${err.message}`);
  }
  return out;
}

export function purgeExpiredCommunityData(now = Date.now()) {
  return purgeCommunityData(
    new Date(now - EVENT_RETENTION_DAYS * DAY_MS).toISOString(),
    new Date(now - AUDIT_RETENTION_DAYS * DAY_MS).toISOString()
  );
}

// Storage limitation: expired evidence is deleted on boot and every 6h.
// unref() so this timer never keeps a test process or shutdown alive.
try {
  purgeExpiredCommunityData();
} catch (err) {
  console.error(`[community-signals] retention purge failed: ${err.message}`);
}
setInterval(() => {
  try {
    purgeExpiredCommunityData();
  } catch (err) {
    console.error(`[community-signals] retention purge failed: ${err.message}`);
  }
}, PURGE_INTERVAL_MS).unref();
