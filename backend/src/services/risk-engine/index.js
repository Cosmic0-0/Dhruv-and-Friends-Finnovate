// Non-LLM, deterministic risk engine. A pure function of (signals, context,
// ruleset): no clock, no I/O, no model call. The LLM never calls or emulates
// this - its only input here is grounded, enum-coded semantic signals, whose
// total influence is capped.
//
// Demo note: the `trace` array this returns is what the UI shows as
// "how this score was calculated" - every point, cap, interaction and floor
// has a rule ID, and the footer can truthfully say the AI did not compute it.
//
// Never edit a published ruleset in place: add RULESET_RS_1_1 and switch
// ACTIVE_RULESET, so past decisions stay explainable.

export const RULESET_RS_1_0 = Object.freeze({
  version: "rs-1.0",
  // Base points per signal code. An object gives per-source-type points
  // (lexicon vs semantic_model); `default` covers every other source type.
  weights: Object.freeze({
    "URL-01": 30, "URL-02": 30, "URL-03": 25, "URL-04": 25, "URL-05": 5, "URL-06": 20, "URL-07": 25, "URL-08": 10,
    "ID-01": 30, "ID-02": 25, "ID-03": 20, "ID-04": 12,
    "SOC-01": { lexicon: 6, semantic_model: 8, default: 6 },
    "SOC-02": 10,
    "SOC-03": { lexicon: 15, semantic_model: 12, default: 15 },
    "SOC-04": 8, "SOC-05": 8, "SOC-06": 12, "SOC-07": 25,
    "PAY-01": 8, "PAY-02": 25, "PAY-03": 35, "PAY-04": 15, "PAY-05": 25, "PAY-06": 30, "PAY-07": 20,
    "SEC-01": 30, "SEC-02": 30,
    "REP-01": 10, "REP-02": 20, "REP-03": 10, "REP-04": 40, "REP-05": 45,
  }),
  caps: Object.freeze({
    // Maximum total contribution of findings backed ONLY by the semantic
    // model (and of interactions among them): semantic-only evidence can
    // reach Elevated / verify_first, never a bank-grade do_not_pay.
    semanticOnly: 30,
    // Lexicon-only findings (phrases, no technical/contextual fact).
    lexiconOnly: 40,
  }),
  // A small closed set, each applied at most once.
  interactions: Object.freeze([
    { id: "IX-1", points: 15, reason: "Impersonation combined with a payment or credential request",
      a: ["ID-01", "ID-02", "ID-03", "ID-04", "URL-01", "URL-02", "URL-03", "URL-04"],
      b: ["PAY-01", "PAY-02", "PAY-03", "PAY-04", "PAY-05", "PAY-07", "SEC-01", "SEC-02"] },
    { id: "IX-2", points: 10, reason: "Urgency or threat combined with a credential request", a: ["SOC-01", "SOC-02"], b: ["SEC-01"] },
    { id: "IX-3", points: 10, reason: "Secrecy combined with a payment request", a: ["SOC-03"], b: ["PAY-01", "PAY-02", "PAY-03", "PAY-05", "PAY-07"] },
    { id: "IX-4", points: 10, reason: "Prize or refund combined with an upfront fee", a: ["SOC-05"], b: ["PAY-04"] },
    { id: "IX-5", points: 15, reason: "Relationship/investment manipulation combined with an unusual payment method", a: ["SOC-06"], b: ["PAY-02"] },
  ]),
  // Minimum level regardless of the additive sum. Only non-semantic
  // evidence can trigger a floor.
  floors: Object.freeze([
    { id: "FLOOR-REP05-MALICIOUS-URL", level: "high", reason: "Link is on a known-malicious list", all: ["REP-05"] },
    { id: "FLOOR-REP04-KNOWN-TEMPLATE", level: "high", reason: "Matches a confirmed scam template", all: ["REP-04"] },
    { id: "FLOOR-PAY03-SAFE-ACCOUNT", level: "high", reason: "'Safe account' payment instruction", all: ["PAY-03"] },
    { id: "FLOOR-SEC01-INSTITUTION", level: "high", reason: "OTP/PIN/password request combined with a claimed known institution", all: ["SEC-01"], requiresClaimedInstitution: true },
    { id: "FLOOR-SEC02-INSTITUTION", level: "high", reason: "Remote-access request combined with a claimed known institution", all: ["SEC-02"], requiresClaimedInstitution: true },
    { id: "FLOOR-REP02-TECHNICAL", level: "critical", reason: "Active community scam wave plus a technical impersonation finding",
      all: ["REP-02"], any: ["URL-01", "URL-02", "URL-03", "URL-04", "ID-01", "ID-02"] },
  ]),
  bands: Object.freeze([
    { level: "low", min: 0 },
    { level: "elevated", min: 20 },
    { level: "high", min: 45 },
    { level: "critical", min: 70 },
  ]),
});

export const ACTIVE_RULESET = RULESET_RS_1_0;
export const RULESETS = Object.freeze({ [RULESET_RS_1_0.version]: RULESET_RS_1_0 });

const LEVEL_ORDER = ["low", "elevated", "high", "critical"];
// Codes that describe one link; all of them about the same host are one fact.
const HOST_CODES = new Set(["URL-01", "URL-02", "URL-03", "URL-04", "URL-08", "ID-01"]);
const IMPERSONATION_CODES = new Set(["URL-01", "URL-02", "URL-03", "URL-04", "ID-01", "ID-02"]);

/** Legacy verdict for existing API consumers, derived only from the level. */
export function verdictForLevel(level) {
  if (level === "low") return "safe";
  if (level === "elevated") return "suspicious";
  return "scam";
}

export function levelForScore(score, ruleset = ACTIVE_RULESET) {
  let level = "low";
  for (const band of ruleset.bands) if (score >= band.min) level = band.level;
  return level;
}

function pointsFor(signal, ruleset) {
  const w = ruleset.weights[signal.code];
  if (typeof w === "number") return w;
  if (w && typeof w === "object") return w[signal.sourceType] ?? w.default ?? 0;
  return 0;
}

/**
 * Collapses correlated signals into findings. Signals about the same host
 * (URL-0x + ID-01 for one link) form one finding; the same code from several
 * sources (lexicon + semantic) forms one finding; a semantic authority-
 * impersonation read (ID-04) corroborates an existing deterministic
 * impersonation finding instead of scoring again. Each finding scores once,
 * at its highest-weight member.
 */
export function dedupe(signals, ruleset = ACTIVE_RULESET) {
  const groups = new Map();
  for (const signal of signals) {
    const host = signal.metadata?.host;
    const key = host && HOST_CODES.has(signal.code) ? `host:${host}` : `code:${signal.code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(signal);
  }

  const impersonationKey = [...groups.keys()].find((k) =>
    groups.get(k).some((s) => IMPERSONATION_CODES.has(s.code) && s.sourceType !== "semantic_model")
  );
  if (impersonationKey && groups.has("code:ID-04")) {
    groups.get(impersonationKey).push(...groups.get("code:ID-04"));
    groups.delete("code:ID-04");
  }

  // The scored member is the strongest VERIFIED one: a code/lexicon finding
  // outranks the model's read of the same fact, which then only corroborates
  // (so a model agreement can never add points above the verified weight).
  const rank = (s) => (s.sourceType === "semantic_model" ? 0 : 1000) + pointsFor(s, ruleset);
  return [...groups.values()].map((members) => {
    const ranked = [...members].sort((a, b) => rank(b) - rank(a));
    const primary = ranked[0];
    const sourceTypes = [...new Set(members.map((m) => m.sourceType))];
    const corroboratedBy = [...new Set(ranked.slice(1).map((m) => (m.code === primary.code ? m.sourceType : m.code)))];
    return { code: primary.code, primary, members, sourceTypes, corroboratedBy, points: pointsFor(primary, ruleset) };
  });
}

const isSemanticOnly = (f) => f.sourceTypes.every((s) => s === "semantic_model");
const isLexiconOnly = (f) => f.sourceTypes.every((s) => s === "lexicon");
const isDeterministic = (f) => f.sourceTypes.some((s) => s === "rule" || s === "intel" || s === "community");

function confidenceFor(findings, { semanticStatus, ocrQuality }) {
  const det = findings.filter(isDeterministic);
  const hasLexicon = findings.some((f) => f.sourceTypes.includes("lexicon"));
  const hasSemantic = findings.some((f) => f.sourceTypes.includes("semantic_model"));
  const families = new Set(
    findings.flatMap((f) => f.sourceTypes.map((s) => (s === "lexicon" ? "lexicon" : s === "semantic_model" ? "semantic" : "deterministic")))
  );
  const semanticOk = semanticStatus === "ok";

  let confidence;
  if (det.some((f) => f.points >= 20) || (det.length > 0 && families.size >= 2)) confidence = "high";
  else if (det.length > 0 || (hasLexicon && hasSemantic)) confidence = "moderate";
  else if (hasLexicon) confidence = semanticOk ? "moderate" : "low";
  else if (hasSemantic) confidence = "low";
  else confidence = semanticOk ? "moderate" : "low";

  if (ocrQuality === "low") confidence = confidence === "high" ? "moderate" : "low";
  return confidence;
}

/**
 * @param {object[]} signals registry signals (services/signals/registry.js)
 * @param {{ semanticStatus?: string, claimedInstitution?: object|null, ocrQuality?: string }} [context]
 * @param {string} [rulesetVersion]
 * @returns {{ rulesetVersion: string, score: number, level: string, confidence: string, decision: string, trace: object[], findings: object[] }}
 */
export function score(signals, context = {}, rulesetVersion = ACTIVE_RULESET.version) {
  const ruleset = RULESETS[rulesetVersion];
  if (!ruleset) throw new Error(`unknown ruleset: ${rulesetVersion}`);
  const findings = dedupe(signals, ruleset);
  const trace = [];

  let semanticSum = 0;
  let lexiconSum = 0;
  let otherSum = 0;
  for (const f of findings) {
    if (f.points <= 0) continue;
    if (isSemanticOnly(f)) semanticSum += f.points;
    else if (isLexiconOnly(f)) lexiconSum += f.points;
    else otherSum += f.points;
    trace.push({
      id: f.code,
      points: f.points,
      sourceTypes: f.sourceTypes,
      reason: f.primary.description,
      ...(f.corroboratedBy.length ? { corroboratedBy: f.corroboratedBy } : {}),
    });
  }

  const present = (codes, pred = () => true) => findings.filter((f) => codes.includes(f.code) && pred(f));
  for (const ix of ruleset.interactions) {
    const a = present(ix.a);
    const b = present(ix.b);
    if (a.length === 0 || b.length === 0) continue;
    // An interaction is only as strong as its evidence: one built purely on
    // AI-inferred (or purely on phrase) findings counts inside that cap.
    const participants = [...a, ...b];
    const allSemantic = participants.every(isSemanticOnly);
    const allLexicon = !allSemantic && participants.every((f) => isSemanticOnly(f) || isLexiconOnly(f));
    if (allSemantic) semanticSum += ix.points;
    else if (allLexicon) lexiconSum += ix.points;
    else otherSum += ix.points;
    trace.push({ id: ix.id, points: ix.points, reason: ix.reason, ...(allSemantic ? { semanticOnly: true } : {}) });
  }

  if (semanticSum > ruleset.caps.semanticOnly) {
    trace.push({ id: "CAP-SEMANTIC", points: ruleset.caps.semanticOnly - semanticSum, reason: `AI-inferred evidence alone is capped at ${ruleset.caps.semanticOnly} points` });
    semanticSum = ruleset.caps.semanticOnly;
  }
  if (lexiconSum > ruleset.caps.lexiconOnly) {
    trace.push({ id: "CAP-LEXICON", points: ruleset.caps.lexiconOnly - lexiconSum, reason: `Phrase-only evidence is capped at ${ruleset.caps.lexiconOnly} points` });
    lexiconSum = ruleset.caps.lexiconOnly;
  }

  let total = Math.min(100, semanticSum + lexiconSum + otherSum);
  let level = levelForScore(total, ruleset);

  const nonSemantic = (f) => !isSemanticOnly(f);
  for (const floor of ruleset.floors) {
    if (!floor.all.every((c) => present([c], nonSemantic).length > 0)) continue;
    if (floor.any && present(floor.any, nonSemantic).length === 0) continue;
    if (floor.requiresClaimedInstitution && !context.claimedInstitution) continue;
    if (LEVEL_ORDER.indexOf(floor.level) <= LEVEL_ORDER.indexOf(level)) continue;
    const min = ruleset.bands.find((b) => b.level === floor.level).min;
    trace.push({ id: floor.id, levelFloor: floor.level, points: min - total, reason: floor.reason });
    total = min;
    level = floor.level;
  }

  const decision =
    level === "low" ? "proceed" : level === "elevated" || !findings.some(nonSemantic) ? "verify_first" : "do_not_pay";

  return {
    rulesetVersion: ruleset.version,
    score: total,
    level,
    confidence: confidenceFor(findings, context),
    decision,
    trace,
    findings,
  };
}
