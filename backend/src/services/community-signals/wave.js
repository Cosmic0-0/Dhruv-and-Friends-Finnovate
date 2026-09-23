// Non-LLM, deterministic cluster/wave evaluation over stored report events.
// Pure functions only - no DB, no clock reads (callers pass `now`), so every
// decision is reproducible from (events, now, rules) alone. That
// reproducibility is the compliance property this module exists to provide:
// any risk adjustment it produces can be re-derived later from the audit log
// (services/community-signals/index.js) plus the versioned rule set below.

import { hammingDistance } from "./fingerprint.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Versioned thresholds. Never edit a published version in place - add
// WAVE_RULES_V2 and switch ACTIVE_RULES, so audit rows written under v1 stay
// explainable against the exact thresholds that produced them.
export const WAVE_RULES_V1 = Object.freeze({
  version: "wave-rules-v1",
  lookbackDays: 7,
  baselineDays: 14,
  burstWindowHours: 24,
  halfLifeDays: 7,
  minBaselinePerDay: 0.5,
  // Measured (see fingerprint.js simhash()): 1-2 word edits land at 4-5,
  // the same template aimed at a DIFFERENT bank at ~11, unrelated at 28+.
  // 6 keeps near-duplicates in and cross-brand variants out; heavier
  // rewordings of one campaign are still caught by the shared lookalike
  // host, which is a separate match criterion.
  simhashMaxDistance: 6,
  // Very short templates have too few tokens for SimHash distance to mean
  // anything - below this they can only match by exact hash/host/sender.
  simhashMinTokens: 8,
  // Machine-originated events (a scam verdict backed by a deterministic
  // check) count for half, and can never on their own satisfy
  // minHumanReports - so the LLM's own past verdicts can't bootstrap a boost
  // to its future verdicts (feedback-loop guard).
  weights: Object.freeze({ user_report: 1, auto_high_confidence: 0.5 }),
  cluster: Object.freeze({
    ruleId: "CW-1",
    type: "community_cluster",
    minDistinctReporters: 3,
    minHumanReports: 1,
    minDecayedWeight: 2,
    severity: "medium",
    riskDelta: 10,
  }),
  wave: Object.freeze({
    ruleId: "CW-2",
    type: "community_wave",
    minDistinctReporters24h: 5,
    minBurstRatio: 3,
    severity: "high",
    riskDelta: 20,
  }),
});

export const ACTIVE_RULES = WAVE_RULES_V1;

/**
 * Why (if at all) a stored event belongs to the same campaign as the message
 * being analyzed. Returns every criterion that matched, so the evidence
 * trail shows the strongest link, not just the first one found.
 * @returns {string[]} subset of ["template", "near_duplicate", "lookalike_host", "sender"]
 */
export function matchReasons(candidate, event, rules = ACTIVE_RULES) {
  const reasons = [];
  if (candidate.templateHash === event.templateHash) reasons.push("template");
  if (
    !reasons.includes("template") &&
    candidate.tokenCount >= rules.simhashMinTokens &&
    event.tokenCount >= rules.simhashMinTokens &&
    hammingDistance(candidate.simhash, event.simhash) <= rules.simhashMaxDistance
  ) {
    reasons.push("near_duplicate");
  }
  const eventHosts = new Set(event.lookalikeHosts || []);
  if ((candidate.lookalikeHosts || []).some((h) => eventHosts.has(h))) reasons.push("lookalike_host");
  if (candidate.senderKey && candidate.senderKey === event.senderKey) reasons.push("sender");
  return reasons;
}

function weightOf(event, rules) {
  return rules.weights[event.origin] ?? 0;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {Array<{id:number, createdAt:string, origin:string, reporterHash:string}>} matched
 *   events already filtered by matchReasons()
 * @param {number} now epoch ms
 */
export function computeMetrics(matched, now, rules = ACTIVE_RULES) {
  const ageMs = (e) => now - new Date(e.createdAt).getTime();
  const lookback = matched.filter((e) => ageMs(e) >= 0 && ageMs(e) <= rules.lookbackDays * DAY_MS);
  const burst = lookback.filter((e) => ageMs(e) <= rules.burstWindowHours * HOUR_MS);
  const baselineStart = rules.burstWindowHours * HOUR_MS;
  const baselineEnd = baselineStart + rules.baselineDays * DAY_MS;
  const baselineEvents = matched.filter((e) => ageMs(e) > baselineStart && ageMs(e) <= baselineEnd);

  const sumWeights = (events) => events.reduce((sum, e) => sum + weightOf(e, rules), 0);
  const baselinePerDay = Math.max(rules.minBaselinePerDay, sumWeights(baselineEvents) / rules.baselineDays);
  const weight24h = sumWeights(burst);
  const decayedWeight = lookback.reduce(
    (sum, e) => sum + weightOf(e, rules) * 0.5 ** (ageMs(e) / (rules.halfLifeDays * DAY_MS)),
    0
  );
  const times = lookback.map((e) => e.createdAt).sort();

  return {
    matchedEvents: lookback.length,
    distinctReporters: new Set(lookback.map((e) => e.reporterHash)).size,
    humanReports: lookback.filter((e) => e.origin === "user_report").length,
    distinctReporters24h: new Set(burst.map((e) => e.reporterHash)).size,
    weight24h: round2(weight24h),
    baselinePerDay: round2(baselinePerDay),
    burstRatio: round2(weight24h / baselinePerDay),
    decayedWeight: round2(decayedWeight),
    firstSeen: times[0] ?? null,
    lastSeen: times[times.length - 1] ?? null,
    evidenceIds: lookback.map((e) => e.id),
  };
}

/**
 * Picks the single highest tier whose every threshold is met, or null.
 * Tiers are exclusive (a wave is a cluster that is also bursting), so the
 * risk delta never stacks.
 */
export function selectTier(metrics, rules = ACTIVE_RULES) {
  const { cluster, wave } = rules;
  const isCluster =
    metrics.distinctReporters >= cluster.minDistinctReporters &&
    metrics.humanReports >= cluster.minHumanReports &&
    metrics.decayedWeight >= cluster.minDecayedWeight;
  if (!isCluster) return null;
  const isWave =
    metrics.distinctReporters24h >= wave.minDistinctReporters24h && metrics.burstRatio >= wave.minBurstRatio;
  return isWave ? wave : cluster;
}

/**
 * Full evaluation: match -> metrics -> tier. Returns null when the evidence
 * doesn't meet any tier (the common case - no signal is emitted at all).
 */
export function evaluateCommunityEvidence(candidate, events, now, rules = ACTIVE_RULES) {
  const reasonCounts = {};
  const matched = [];
  for (const event of events) {
    const reasons = matchReasons(candidate, event, rules);
    if (reasons.length === 0) continue;
    matched.push(event);
    for (const r of reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  }
  if (matched.length === 0) return null;

  const metrics = computeMetrics(matched, now, rules);
  const tier = selectTier(metrics, rules);
  if (!tier) return null;
  return { tier, metrics, matchedBy: reasonCounts, rulesVersion: rules.version };
}

// Signals from checks that don't involve the LLM at all (domain matching,
// identity consistency). Only these may corroborate a crowd-driven
// escalation to "scam" - crowd evidence plus LLM opinion alone is not enough.
export function hasDeterministicHighSignal(signals) {
  return (signals || []).some(
    (s) => s.severity === "high" && (s.source === "url_parser" || s.source === "identity_check")
  );
}

/**
 * Verdict escalation policy (see services/community-signals/README.md):
 *   - crowd evidence alone can raise "safe" to "suspicious", never further;
 *   - "suspicious" -> "scam" only on a CW-2 wave AND a deterministic
 *     high-severity signal on this same message;
 *   - never lowers a verdict, never touches "unknown".
 */
export function escalateVerdict(verdict, tier, deterministicHigh, rules = ACTIVE_RULES) {
  if (verdict === "safe") return "suspicious";
  if (verdict === "suspicious" && tier.ruleId === rules.wave.ruleId && deterministicHigh) return "scam";
  return verdict;
}

function describe(tier, m, rules) {
  const window = tier.ruleId === rules.wave.ruleId ? `${m.distinctReporters24h} in the last 24h, ` : "";
  return (
    `Matches a message pattern reported by ${m.distinctReporters} different people in the last ` +
    `${rules.lookbackDays} days (${window}${m.burstRatio}x the usual rate).`
  );
}

/**
 * Turns an evaluation into the additive response pieces: one signals[] item
 * with a full evidence object, and one riskAdjustments[] ledger entry.
 * Pure - the caller persists the audit row and attaches `auditRef`.
 */
export function buildAdjustment(result, evaluation, rules = ACTIVE_RULES) {
  const { tier, metrics, matchedBy, rulesVersion } = evaluation;
  const deterministicHigh = hasDeterministicHighSignal(result.signals);
  const verdictTo = escalateVerdict(result.verdict, tier, deterministicHigh, rules);

  const signal = {
    type: tier.type,
    description: describe(tier, metrics, rules),
    severity: tier.severity,
    source: "community_reports",
    communityEvidence: {
      ruleId: tier.ruleId,
      rulesVersion,
      matchedBy,
      distinctReporters: metrics.distinctReporters,
      distinctReporters24h: metrics.distinctReporters24h,
      humanReports: metrics.humanReports,
      burstRatio: metrics.burstRatio,
      windowDays: rules.lookbackDays,
      firstSeen: metrics.firstSeen,
      lastSeen: metrics.lastSeen,
    },
  };

  const adjustment = {
    ruleId: tier.ruleId,
    rulesVersion,
    riskDelta: tier.riskDelta,
    verdictFrom: result.verdict,
    verdictTo,
    evidenceEventIds: metrics.evidenceIds,
  };

  const adjustedRiskScore =
    typeof result.riskScore === "number" ? Math.min(100, result.riskScore + tier.riskDelta) : undefined;

  return { signal, adjustment, verdictTo, adjustedRiskScore, metrics };
}
