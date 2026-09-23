// Community cluster/wave evidence: records scam reports as timestamped,
// privacy-minimised events and, on each analysis, checks whether the
// message belongs to a pattern that many distinct people have reported
// recently. If so, it adds ONE structured, evidence-backed signal and a
// bounded, audited risk adjustment. See README.md in this directory for the
// full rule set, the verdict-escalation policy, and the compliance controls.
//
// Reliability (root CLAUDE.md "Judging Priorities"): everything here is
// best-effort enrichment. applyCommunityEvidence() never throws - on any
// failure it logs and returns the result unchanged, so a DB problem can
// never fail /api/analyze.

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { redact } from "../redact/index.js";
import { BRAND_TOKENS, LEGIT_DOMAINS, extractHostnames, extractLookalikeHosts } from "../domain-matching/index.js";
import {
  normalizeSender,
  insertReportEvent,
  getReportEventsSince,
  insertRiskAudit,
  purgeCommunityData,
} from "../../db/index.js";
import { fingerprintMessage } from "./fingerprint.js";
import { ACTIVE_RULES, evaluateCommunityEvidence, buildAdjustment, hasDeterministicHighSignal } from "./wave.js";

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
  return hosts.length > 0 && hosts.every((h) => LEGIT_DOMAINS.includes(h));
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

function recordAutoEvent(result, candidate, ip, now) {
  const identitySignal = result.signals.find((s) => s.type === "IDENTITY_MISMATCH");
  insertReportEvent({
    createdAt: new Date(now).toISOString(),
    origin: "auto_high_confidence",
    ...candidate,
    brandClaimed: identitySignal?.claimedIdentity?.toLowerCase() ?? null,
    reporterHash: reporterHash(ip),
    evidence: {
      verdict: result.verdict,
      deterministicSignals: result.signals
        .filter((s) => s.severity === "high" && (s.source === "url_parser" || s.source === "identity_check"))
        .map((s) => s.type),
    },
  });
}

function applyAdjustment(result, evaluation, now) {
  const { signal, adjustment, verdictTo, adjustedRiskScore, metrics } = buildAdjustment(result, evaluation);
  const auditRef = randomUUID();
  const { evidenceIds, ...auditMetrics } = metrics;
  insertRiskAudit({ id: auditRef, createdAt: new Date(now).toISOString(), ...adjustment, metrics: auditMetrics });

  result.signals.push(signal);
  result.verdict = verdictTo;
  if (adjustedRiskScore !== undefined) result.adjustedRiskScore = adjustedRiskScore;
  const { evidenceEventIds, ...publicAdjustment } = adjustment;
  result.riskAdjustments = [{ ...publicAdjustment, evidenceCount: evidenceEventIds.length, auditRef }];
}

/**
 * Evaluates community evidence for an analyzed message and, when a rule
 * fires, adds the community signal + audited adjustment to `result`. Also
 * records this analysis as a (half-weight) evidence event when its scam
 * verdict is corroborated by a deterministic high-severity check.
 * Order matters: evaluate BEFORE recording, so a message never counts as
 * evidence for itself.
 * @param {object} result analysis result (mutated, matching routes/index.js)
 * @param {string} message the text that was analyzed
 * @param {{ ip?: string, now?: number }} [context]
 */
export function applyCommunityEvidence(result, message, { ip, now = Date.now() } = {}) {
  if (!result || !Array.isArray(result.signals) || result.verdict === "unknown") return result;
  try {
    const text = redact(message).redacted;
    const candidate = buildCandidate(text, result.observedSender ?? result.sender);
    const verdictBeforeCommunity = result.verdict;
    const corroborated = verdictBeforeCommunity === "scam" && hasDeterministicHighSignal(result.signals);

    if (!linksOnlyOfficialDomains(text)) {
      const events = getReportEventsSince(new Date(now - FETCH_WINDOW_MS).toISOString());
      const evaluation = evaluateCommunityEvidence(candidate, events, now);
      if (evaluation) applyAdjustment(result, evaluation, now);
    }
    if (corroborated) recordAutoEvent({ ...result, verdict: verdictBeforeCommunity }, candidate, ip, now);
  } catch (err) {
    console.error(`[community-signals] skipped: ${err.message}`);
  }
  return result;
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
