// The single FraudLens analysis pipeline, shared by /api/analyze,
// /api/analyze/screenshot, /api/analyze/document and /api/batch-scan:
//
//   normalise -> deterministic entity extraction
//     -> [ deterministic detectors | intelligence/community | bounded semantic model ]
//     -> signal registry -> dedupe/validation -> deterministic risk engine
//     -> decision policy -> intervention policy -> response
//
// Code verifies facts. AI interprets language. The deterministic engine
// decides. The semantic model is optional enrichment: when it times out,
// fails or returns garbage, runPipeline still returns a full deterministic
// assessment (analysis.semantic.status tells you which).
//
// Demo note: run a lookalike-link message with LLM_MODE=local and Ollama
// stopped - the risk level is unchanged, only the "inferred" signals vanish.

import { normalizeText, inputHash } from "../normalize/index.js";
import { findClaimedInstitution, REGISTRY_VERSION } from "../institutions/index.js";
import { checkUrls, checkLinkHygiene, registrableDomain, DETECTOR_VERSION as URL_DETECTOR_VERSION } from "../domain-matching/index.js";
import { attachDomainAges } from "../domain-age/index.js";
import { checkThreatIntel } from "../threat-intel/index.js";
import { checkIdentityConsistency } from "../identity-consistency/index.js";
import { checkPageForms } from "../page-forms/index.js";
import { detectLexicon, detectInjection, detectTemplateArtifacts, detectLanguage, LEXICON_VERSION } from "../lexicon/index.js";
import { evaluatePaymentContext } from "../payment-context/index.js";
import { analyzeSemantics, SEMANTIC_PROMPT_VERSION } from "../analysis/index.js";
import { evaluateCommunitySignal, recordCommunityOutcome, communitySenderKey } from "../community-signals/index.js";
import { ACTIVE_RULES as WAVE_RULES } from "../community-signals/wave.js";
import { score, verdictForLevel } from "../risk-engine/index.js";
import { planInterventions, buildExplanation, POLICY_VERSION } from "../interventions/index.js";
import { computeRiskCategories } from "../risk-categories/index.js";
import { getLikelyNextStages } from "../playbooks/index.js";
import { attachScamDna } from "../scam-dna/index.js";
import { makeSignal, SIGNAL_DEFS } from "../signals/registry.js";
import { availableEvidence } from "../email-context/index.js";
import { detectEmailSignals, EMAIL_DETECTOR_VERSION } from "../email-signals/index.js";
import { detectOrgSignals, ORG_DETECTOR_VERSION } from "../org-identity/index.js";
import { extractIndicators, evaluateOrgIntel, observationId, pseudonym, recordOrgEmail } from "../org-intel/index.js";
import { planVerification, VERIFICATION_POLICY_VERSION } from "../verification-workflows/index.js";
import { DEMO_DIRECTORY, DEMO_ORGANISATION, DEMO_SUPPLIERS } from "../workplace-registry/index.js";
import { getReportCount } from "../../db/index.js";

export const SOURCES = Object.freeze(["pasted_text", "screenshot", "email", "batch", "document"]);

// A sender reported this many times (legacy per-sender counter) becomes a
// REP-03 signal.
const SENDER_REPORT_THRESHOLD = 3;
const SEMANTIC_TIMEOUT_MS = Number(process.env.SEMANTIC_TIMEOUT_MS) || undefined;

// "From: X" / "Sender: X" line; X ends at the line end or a sentence break.
const OBSERVED_SENDER_RE = /^(?:from|sender|de|exp[ée]diteur)\s*:\s*([^\n]{1,60}?)(?:\.\s|\n|$)/im;

function extractObservedSender(text) {
  const m = OBSERVED_SENDER_RE.exec(text);
  if (!m) return null;
  const value = m[1].trim().replace(/[.,;]+$/, "");
  return value || null;
}

// Stage implied by deterministic findings, used when the semantic model
// gives none (or is down) so interventions still know where the victim is.
function derivedStage(codes) {
  if (codes.has("SEC-01")) return "OTP_REQUEST";
  if (codes.has("SEC-02")) return "CREDENTIAL_REQUEST";
  if (["PAY-01", "PAY-02", "PAY-03", "PAY-04", "PAY-05", "PAY-07", "EMAIL-06", "EMAIL-07"].some((c) => codes.has(c))) return "PAYMENT_REQUEST";
  return null;
}

// Deterministic "is this asking for money" - EMAIL-10 only fires with one.
const FINANCIAL_CODES = new Set(["PAY-01", "PAY-02", "PAY-03", "PAY-04", "PAY-05", "PAY-07"]);

/**
 * Email: the subject is part of what the recipient reads, so detectors and
 * the semantic model see "Subject: <subject>", a blank line, then the body.
 * Headers / addresses / authentication results are NOT added - they are
 * compared by code only.
 */
function analysisText(rawText, emailContext) {
  const body = normalizeText(rawText);
  return emailContext?.subject ? normalizeText(`Subject: ${emailContext.subject}\n\n${body}`) : body;
}

function emailAnalysis(emailContext, checks) {
  return {
    status: "analysed",
    detector: EMAIL_DETECTOR_VERSION,
    availableEvidence: availableEvidence(emailContext),
    checks,
    // Reference data is DEMONSTRATION data - never presented as a real
    // verified supplier / directory (data/demo-*.json).
    referenceData: { suppliers: DEMO_SUPPLIERS.version, directory: DEMO_DIRECTORY.version, demo: true },
  };
}

function explanationLanguage(language, text) {
  if (language === "en" || language === "fr") return language;
  if (language === "kreol") return "kreol";
  return detectLanguage(text);
}

/**
 * Marks which signal carries each finding's score and which ones only
 * corroborate it - one fact, one scored finding (review H3).
 */
function annotateSignals(findings) {
  const out = [];
  for (const f of findings) {
    out.push({ ...f.primary, scored: true, ...(f.corroboratedBy.length ? { corroboratedBy: f.corroboratedBy } : {}) });
    for (const m of f.members) {
      if (m !== f.primary) out.push({ ...m, scored: false, mergedInto: f.code });
    }
  }
  return out;
}

/**
 * Pre-computed deterministic signals about evidence that is not the text
 * itself (document forensics). Only registry codes are accepted, and never as
 * semantic-model evidence: the model's findings come from analyzeSemantics()
 * alone, where they are grounded and capped.
 */
function acceptedExtraSignals(extraSignals) {
  if (!Array.isArray(extraSignals)) return [];
  return extraSignals.filter((s) => s && SIGNAL_DEFS[s.code] && s.sourceType !== "semantic_model");
}

function senderReputation(sender) {
  if (communitySenderKey(sender) === null) return { reports: undefined, signals: [] };
  const reports = getReportCount(sender);
  const signals =
    reports >= SENDER_REPORT_THRESHOLD
      ? [makeSignal("REP-03", { sourceType: "community", evidence: sender, description: `This sender has been reported ${reports} times by FraudLens users.`, metadata: { reports } })]
      : [];
  return { reports, signals };
}

/**
 * @param {string} rawText the (already redacted) message text
 * @param {{ source?: string, language?: string, paymentContext?: object|null, emailContext?: object|null,
 *   pageHost?: string|null, ip?: string, now?: number, ocrQuality?: "low"|"ok",
 *   extraSignals?: object[], extraDetectorVersions?: Record<string, string>,
 *   semantic?: { enabled?: boolean, timeoutMs?: number, llm?: Function } }} [context]
 *   emailContext must already be validated (services/email-context validateEmailContext); when present,
 *   the source is "email" and the EMAIL-* detectors run on it. pageHost is the hostname of the page this
 *   text was scanned from (e.g. the extension's "Scan This Page"), when known - it is never fetched or
 *   trusted as a claim, only used so a page's own domain/subdomains are never flagged as "not an official
 *   domain" relative to themselves (see domain-matching#checkLinkHygiene). extraSignals are pre-computed
 *   deterministic registry signals about evidence other than the text (document forensics) and are scored with
 *   everything else. extraDetectorVersions are merged into analysis.detectorVersions.
 */
export async function runPipeline(rawText, context = {}) {
  const {
    language, paymentContext = null, emailContext = null, pageHost = null, pageForms = null, ip, now = Date.now(), ocrQuality,
    extraSignals, extraDetectorVersions = {}, semantic: semanticOpts = {},
  } = context;
  const source = emailContext ? "email" : context.source ?? "pasted_text";
  const text = analysisText(rawText, emailContext);

  // Semantic analysis runs in parallel with the deterministic detectors.
  const semanticPromise =
    semanticOpts.enabled === false
      ? Promise.resolve({ status: "skipped", signals: [], rejected: [], scamType: null, stage: null, observedSender: null })
      : analyzeSemantics(text, { language, timeoutMs: semanticOpts.timeoutMs ?? SEMANTIC_TIMEOUT_MS, llm: semanticOpts.llm });

  const claim =
    findClaimedInstitution(text) ??
    (paymentContext?.claimedOrganisation ? findClaimedInstitution(paymentContext.claimedOrganisation) : null) ??
    (emailContext?.from?.name ? findClaimedInstitution(emailContext.from.name) : null);
  const claimedInstitution = claim?.institution ?? null;

  // Links the email client extracted (href targets can differ from the
  // visible text) are checked by the same URL rules; spans refer to the body
  // only, so theirs are dropped.
  const clientUrls = emailContext?.urls.length ? checkUrls(emailContext.urls.join("\n")).map(({ span, ...s }) => s) : [];
  const urlSignals = [...checkUrls(text), ...clientUrls];
  const attachAges = attachDomainAges(urlSignals, urlSignals.map((s) => s.metadata.host));
  const lexicon = detectLexicon(text);
  const email = emailContext
    ? detectEmailSignals(emailContext, { text, paymentContext, financialRequest: lexicon.some((s) => FINANCIAL_CODES.has(s.code)) || Boolean(paymentContext) })
    : null;
  const organisation = emailContext ? detectOrgSignals(emailContext, { text, now }) : null;
  const deterministic = [
    ...urlSignals,
    ...checkLinkHygiene(text, pageHost),
    // Known-phishing lists (REP-05 - already weighted and floored to "high"
    // by the risk engine; nothing emitted it until now).
    ...checkThreatIntel(text),
    ...checkIdentityConsistency(text),
    ...checkPageForms(pageForms, { pageHost, claimedInstitution }),
    ...lexicon,
    ...detectInjection(text),
    ...detectTemplateArtifacts(text),
    ...evaluatePaymentContext(paymentContext),
    ...(email?.signals ?? []),
    ...(organisation?.signals ?? []),
    ...acceptedExtraSignals(extraSignals),
  ];

  const semantic = await semanticPromise;
  attachAges();

  const observedSender = emailContext?.from?.address ?? extractObservedSender(text) ?? semantic.observedSender ?? null;
  const sender = observedSender ?? claimedInstitution?.display_name ?? null;
  const reputation = senderReputation(sender);
  const community = evaluateCommunitySignal(text, { sender: observedSender, now });

  const analysisInputHash = inputHash(text);
  let orgIntel = null;
  let orgObservationId = null;
  let orgRecorded = false;
  if (emailContext) {
    const orgId = DEMO_ORGANISATION.organisationId;
    const senderKey = pseudonym(orgId, emailContext.from?.address);
    const recipientKey = pseudonym(orgId, emailContext.recipient?.address);
    orgObservationId = observationId({ orgId, inputHash: analysisInputHash, messageId: emailContext.messageId, recipientKey });
    const indicators = extractIndicators(emailContext, { text, paymentContext, signals: deterministic });
    const preliminary = score([...deterministic, ...semantic.signals, ...reputation.signals], {
      semanticStatus: semantic.status, claimedInstitution, ocrQuality,
    });
    orgIntel = evaluateOrgIntel({
      orgId,
      inputHash: orgObservationId,
      indicators,
      senderKey,
      recipientKey,
      senderDomain: emailContext.from?.domain ? registrableDomain(emailContext.from.domain) : null,
      flagged: preliminary.level !== "low",
      now,
    });
    orgIntel.indicators = indicators;
    orgIntel.senderKey = senderKey;
    orgIntel.recipientKey = recipientKey;
  }

  const withoutCommunity = [...deterministic, ...semantic.signals, ...reputation.signals, ...(orgIntel?.signals ?? [])];
  const signals = community.signal ? [...withoutCommunity, community.signal] : withoutCommunity;
  const engineContext = { semanticStatus: semantic.status, claimedInstitution, ocrQuality };
  const decision = score(signals, engineContext);
  const levelWithoutCommunity = community.signal ? score(withoutCommunity, engineContext).level : decision.level;
  const { riskAdjustment } = recordCommunityOutcome({ community, signals, decision, levelWithoutCommunity, ip, now });

  // Every code in a finding, incl. merged ones (a PAY-07 absorbed into
  // EMAIL-06 still means "payment details changed" to the policies below).
  const codes = new Set(decision.findings.flatMap((f) => f.members.map((m) => m.code)));
  const stage = semantic.stage ?? derivedStage(codes);
  const scamType = semantic.scamType;
  const variants = decision.findings.flatMap((f) => f.members.filter((m) => m.metadata?.variant).map((m) => `${m.code}:${m.metadata.variant}`));
  const interventions = planInterventions({ level: decision.level, codes, variants, scamType, stage, source });
  const verification = planVerification({
    level: decision.level,
    signals: decision.findings.flatMap((f) => f.members),
    profile: DEMO_ORGANISATION,
  });
  const inferredCount = decision.findings.filter((f) => f.sourceTypes.every((s) => s === "semantic_model")).length;

  const result = {
    verdict: verdictForLevel(decision.level),
    riskScore: decision.score,
    risk: { score: decision.score, level: decision.level, confidence: decision.confidence },
    decision: decision.decision,
    signals: annotateSignals(decision.findings),
    trace: decision.trace,
    actions: interventions.actions,
    reduceConcern: interventions.reduceConcern,
    suggestedAction: interventions.suggestedAction,
    explanation: buildExplanation(
      { level: decision.level, score: decision.score, findingCount: decision.findings.length, inferredCount, semanticStatus: semantic.status },
      explanationLanguage(language, text)
    ),
    // Describes message content only - community evidence is excluded.
    riskCategories: computeRiskCategories(withoutCommunity),
    analysis: {
      rulesetVersion: decision.rulesetVersion,
      source: SOURCES.includes(source) ? source : "pasted_text",
      inputHash: analysisInputHash,
      detectorVersions: {
        url: URL_DETECTOR_VERSION,
        lexicon: LEXICON_VERSION,
        institutions: REGISTRY_VERSION,
        community: WAVE_RULES.version,
        interventions: POLICY_VERSION,
        ...(email ? { email: EMAIL_DETECTOR_VERSION } : {}),
        ...(organisation ? { organisation: ORG_DETECTOR_VERSION, verification: VERIFICATION_POLICY_VERSION } : {}),
        ...extraDetectorVersions,
      },
      semantic: {
        status: semantic.status,
        ...(semantic.model ? { model: semantic.model } : {}),
        ...(semantic.provider ? { provider: semantic.provider } : {}),
        promptVersion: SEMANTIC_PROMPT_VERSION,
        rejectedSignals: semantic.rejected.length,
        ...(semantic.error ? { error: semantic.error } : {}),
      },
    },
  };
  if (email) {
    orgRecorded = recordOrgEmail({
      orgId: DEMO_ORGANISATION.organisationId,
      inputHash: orgObservationId,
      senderKey: orgIntel.senderKey,
      senderDomain: emailContext.from?.domain ? registrableDomain(emailContext.from.domain) : null,
      recipientKey: orgIntel.recipientKey,
      level: decision.level,
      flagged: decision.level !== "low",
      indicators: orgIntel.indicators,
      now,
    });
    result.analysis.email = emailAnalysis(emailContext, email.checks);
    result.analysis.organisation = {
      detector: ORG_DETECTOR_VERSION,
      profile: DEMO_ORGANISATION.version,
      observationId: orgObservationId,
      recorded: orgRecorded,
      senderRelation: organisation.senderRelation,
      history: orgIntel.history,
      reputation: orgIntel.reputation,
      campaigns: orgIntel.campaigns,
    };
    result.verification = verification;
  }
  if (sender) result.sender = sender;
  if (observedSender) result.observedSender = observedSender;
  if (reputation.reports !== undefined) result.senderReports = reputation.reports;
  if (riskAdjustment) result.riskAdjustments = [riskAdjustment];
  if (stage) {
    result.scamProfile = { type: scamType, stage, claimedIdentity: claimedInstitution?.display_name ?? null };
    result.journey = { currentStage: stage, likelyNextStages: getLikelyNextStages(scamType, stage) };
  }

  try {
    attachScamDna(result);
  } catch (err) {
    console.error(`[scam-dna] skipped: ${err.message}`);
  }
  return result;
}
