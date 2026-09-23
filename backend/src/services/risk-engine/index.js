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
    // ID-05: unrendered mail-merge/template placeholder syntax. Near-zero
    // false-positive rate (only matches placeholder-shaped interiors, see
    // services/lexicon), so weighted the same as ID-01 (claimed institution
    // linking to a different domain) - both are near-conclusive forgery facts.
    "ID-05": 30,
    "SOC-01": { lexicon: 6, semantic_model: 8, default: 6 },
    "SOC-02": 10,
    "SOC-03": { lexicon: 15, semantic_model: 12, default: 15 },
    "SOC-04": 8, "SOC-05": 8, "SOC-06": 12, "SOC-07": 25,
    "PAY-01": 8, "PAY-02": 25, "PAY-03": 35, "PAY-04": 15, "PAY-05": 25, "PAY-06": 30, "PAY-07": 20,
    "SEC-01": 30, "SEC-02": 30,
    // SEC-03: asks you to log in via a link and enter your password -
    // functionally the same credential-harvesting outcome as SEC-01 (a
    // shared credential), just entered into a linked page instead of typed
    // in-chat, so weighted the same.
    "SEC-03": 30,
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

// rs-1.1 = rs-1.0 unchanged + workplace-email evidence (EMAIL-01..10),
// SOC-08, five email interactions, one email floor and the SOC-07 semantic
// trust policy. Every rs-1.0 weight, cap, interaction, floor and band is
// carried over as-is: text/screenshot results only differ when SOC-08 or
// the SOC-07 policy applies.
//
// Weight reasoning (see docs/API-CONTRACT.md "Email analysis" for the table):
//   Weak alone (<20, stays LOW by itself): EMAIL-01 Reply-To differs 8
//     (help desks and bulk mailers do this legitimately); EMAIL-03 auth
//     anomaly 3-8 (forwarding and mailing lists break SPF/DKIM); EMAIL-05
//     risky attachment 8 / disguised attachment 15; EMAIL-10 unfamiliar
//     address at a known supplier 8; EMAIL-04 thread from a different
//     domain 8 (a new party can legitimately join a thread).
//   Medium: EMAIL-02 claims a known supplier from an unrelated domain 20
//     (= ID-03); EMAIL-08 display-name contradicts address 12-20; EMAIL-03
//     DMARC fail on a domain we deal with 15 (spoofing a real partner).
//   Strong: look-alike of a supplier / thread / our own domain 25-30
//     (= URL-01, deliberate visual deception); EMAIL-06 bank details differ
//     from the trusted record 30 (stronger than PAY-07's 20 because it is
//     compared against a record, not just claimed); EMAIL-07 payee differs
//     from the known payee 30 (vs PAY-05 25, same reason); EMAIL-09 an
//     external sender using a colleague's identity 30.
//   Combinations are carried by EX-* interactions and one floor, not by
//   inflating base weights.
export const RULESET_RS_1_1 = Object.freeze({
  version: "rs-1.1",
  weights: Object.freeze({
    ...RULESET_RS_1_0.weights,
    "SOC-08": { lexicon: 15, semantic_model: 12, default: 15 },
    "EMAIL-01": 8,
    "EMAIL-02": { variants: { lookalike: 30, unrelated: 20 }, default: 20 },
    "EMAIL-03": { variants: { dmarc_fail_known_domain: 15, dmarc_fail: 8, spf_and_dkim_fail: 6, partial_fail: 3 }, default: 3 },
    "EMAIL-04": { variants: { lookalike: 25, different_domain: 8 }, default: 8 },
    "EMAIL-05": { variants: { double_extension: 15, type_mismatch: 15, risky_type: 8 }, default: 8 },
    "EMAIL-06": 30,
    "EMAIL-07": 30,
    "EMAIL-08": { variants: { embedded_address: 20, institution_name: 20, title_on_freemail: 12 }, default: 12 },
    "EMAIL-09": { variants: { directory_name: 30, lookalike_org_domain: 30 }, default: 30 },
    "EMAIL-10": 8,
  }),
  caps: RULESET_RS_1_0.caps,
  // Codes about the SENDER DOMAIN join the per-host grouping: a look-alike
  // sender domain reported by the supplier check (EMAIL-02), the thread
  // check (EMAIL-04), the display-name check (EMAIL-08), the directory check
  // (EMAIL-09) and a URL check on a link to that same domain is ONE fact.
  hostCodes: Object.freeze(["URL-01", "URL-02", "URL-03", "URL-04", "URL-08", "ID-01", "EMAIL-02", "EMAIL-04", "EMAIL-08", "EMAIL-09"]),
  // The same underlying fact seen twice: the record-backed email code scores,
  // the text / form-field code only corroborates.
  absorb: Object.freeze([
    { into: "EMAIL-06", from: ["PAY-07"] },
    { into: "EMAIL-07", from: ["PAY-05", "ID-02"] },
  ]),
  interactions: Object.freeze([
    ...RULESET_RS_1_0.interactions,
    // Only one of EX-6 / EX-1 / EX-3 applies ("email-identity-payment"):
    // all three say "wrong sender + payment", and a look-alike sender domain
    // can be reported by several email checks at once.
    { id: "EX-6", points: 15, group: "email-identity-payment", reason: "Conversation taken over by a different sender who changes payment details",
      a: ["EMAIL-04"], b: ["PAY-07", "EMAIL-06", "EMAIL-07"] },
    { id: "EX-1", points: 15, group: "email-identity-payment", reason: "Supplier identity mismatch combined with a payment request",
      a: ["EMAIL-02"], b: ["PAY-01", "PAY-02", "PAY-05", "PAY-07", "EMAIL-06", "EMAIL-07"] },
    { id: "EX-3", points: 15, group: "email-identity-payment", reason: "Colleague / executive impersonation combined with a payment request",
      a: ["EMAIL-09"], b: ["PAY-01", "PAY-02", "PAY-05", "PAY-07", "EMAIL-06", "EMAIL-07"] },
    { id: "EX-4", points: 10, reason: "Replies redirected to another domain combined with a credential request or look-alike link",
      a: ["EMAIL-01"], b: ["SEC-01", "URL-01", "URL-02", "URL-03", "URL-04"] },
    { id: "EX-5", points: 10, reason: "DMARC failure on a domain you deal with combined with a payment request",
      a: ["EMAIL-03"], aVariants: ["dmarc_fail_known_domain"], b: ["PAY-01", "PAY-02", "PAY-05", "PAY-07", "EMAIL-06", "EMAIL-07"] },
    // EX-2 (payment-detail change + sender identity problem) is a floor below.
  ]),
  floors: Object.freeze([
    ...RULESET_RS_1_0.floors,
    { id: "FLOOR-EX2-EMAIL06-IDENTITY", level: "high", reason: "Supplier bank details changed AND the sender's identity does not check out",
      all: ["EMAIL-06"], any: ["EMAIL-01", "EMAIL-02", "EMAIL-04", "EMAIL-08", "EMAIL-09"] },
  ]),
  policies: Object.freeze({
    // When the message contains instructions aimed at automated checkers
    // (SOC-07), AI-inferred findings stay visible but cannot lift the level
    // above what non-semantic evidence supports. SOC-07's own points are not
    // restricted - they raise suspicion, never trust.
    soc07SemanticNoRaise: true,
  }),
  bands: RULESET_RS_1_0.bands,
});

// rs-1.2 adds organisation-profile and organisation-intelligence facts. The
// published rs-1.0 / rs-1.1 objects above remain frozen and selectable.
export const RULESET_RS_1_2 = Object.freeze({
  version: "rs-1.2",
  weights: Object.freeze({
    ...RULESET_RS_1_1.weights,
    "ORG-01": 30,
    "ORG-02": { variants: { link: 25, reply_to: 20 }, default: 20 },
    "ORG-03": 12,
    "ORG-04": 3,
    "ORG-05": 40,
    "ORG-06": 10,
  }),
  caps: RULESET_RS_1_1.caps,
  hostCodes: Object.freeze([...RULESET_RS_1_1.hostCodes, "ORG-01", "ORG-02", "ORG-03"]),
  absorb: RULESET_RS_1_1.absorb,
  interactions: Object.freeze([
    ...RULESET_RS_1_1.interactions,
    { id: "OX-1", points: 15, group: "email-identity-payment", reason: "Organisation identity impersonation combined with a payment or credential request",
      a: ["ORG-01", "ORG-03"], b: ["PAY-01", "PAY-02", "PAY-05", "PAY-07", "EMAIL-06", "EMAIL-07", "SEC-01"] },
    { id: "OX-2", points: 10, reason: "Organisation campaign evidence corroborates an independently suspicious message",
      a: ["ORG-06"], b: ["ORG-01", "ORG-02", "ORG-03", "EMAIL-02", "EMAIL-04", "EMAIL-06", "EMAIL-07", "EMAIL-09", "SEC-01"] },
  ]),
  floors: Object.freeze([
    ...RULESET_RS_1_1.floors,
    { id: "FLOOR-ORG05-CONFIRMED", level: "high", reason: "The organisation previously confirmed fraud involving the same sender or indicator", all: ["ORG-05"] },
  ]),
  policies: RULESET_RS_1_1.policies,
  bands: RULESET_RS_1_1.bands,
});

// rs-1.3 adds SOC-09 (free/cracked-download bait, services/lexicon) and its
// interaction with ID-04 (an implausible official-publisher claim, see
// services/analysis's broadened ID-04 guidance) - the deterministic half of
// the fake-download-aggregator fix. Deliberately a modest interaction
// (matching IX-1/IX-5's scale), not inflated to force any particular
// fixture into "high" by itself: bait language plus an unverified claim is
// real but not yet a bank-grade fact. A fake-download page that ALSO gates
// the "download" behind a payment/credential step reaches "high" through
// the existing IX-1 interaction (ID-04 is already in its `a` list) without
// needing anything new here - see risk-engine/index.test.js.
export const RULESET_RS_1_3 = Object.freeze({
  version: "rs-1.3",
  weights: Object.freeze({
    ...RULESET_RS_1_2.weights,
    "SOC-09": { lexicon: 8, semantic_model: 8, default: 8 },
  }),
  caps: RULESET_RS_1_2.caps,
  hostCodes: RULESET_RS_1_2.hostCodes,
  absorb: RULESET_RS_1_2.absorb,
  interactions: Object.freeze([
    ...RULESET_RS_1_2.interactions,
    { id: "IX-6", points: 15, reason: "Implausible official-publisher claim combined with free/cracked-download bait language",
      a: ["ID-04"], b: ["SOC-09"] },
  ]),
  floors: RULESET_RS_1_2.floors,
  policies: RULESET_RS_1_2.policies,
  bands: RULESET_RS_1_2.bands,
});

// rs-1.4 adds document-forensics evidence (DOC-01..08, services/
// document-forensics): structural facts about an uploaded PDF/DOCX. Every
// published ruleset above stays frozen and selectable; text-only analyses
// score identically because none of them can emit a DOC-* code.
//
// Weight reasoning:
//   Weak alone (<20, stays LOW by itself): DOC-01 consumer editing tool 10
//     (people legitimately re-save PDFs in online tools); DOC-02 incremental
//     update 8 (form filling and annotations append too); DOC-03 metadata
//     inconsistency 6; DOC-04 plain overlay 10 / DOCX transparent image 8
//     (logos and real Word signatures); DOC-06 hidden text 10; DOC-07
//     embedded file 10 / OLE object 15 / external form submission 15;
//     DOC-08 font outlier 12.
//   Medium (ELEVATED alone, never HIGH alone): DOC-04 transparent overlay
//     25 / upscaled overlay 20 - how pasted signatures and stamps look, but
//     e-signing tools can place transparent images too; DOC-05 visible text
//     typed onto a scan 20; DOC-07 JavaScript 20; DOC-02 changed after a
//     digital signature 30; DOC-07 launch action / macro / remote template
//     30 (malware delivery, not forgery).
//   HIGH needs a forgery artefact plus an identity or payment fact (DX-1),
//   or the forged-institution floor below - never a structural fact alone.
const DOC_FORGERY_B = ["ID-01", "ID-02", "ID-03", "ID-04", "PAY-01", "PAY-02", "PAY-03", "PAY-04", "PAY-05", "PAY-06", "PAY-07"];
export const RULESET_RS_1_4 = Object.freeze({
  version: "rs-1.4",
  weights: Object.freeze({
    ...RULESET_RS_1_3.weights,
    "DOC-01": 10,
    "DOC-02": { variants: { after_signature: 30, incremental_update: 8 }, default: 8 },
    "DOC-03": 6,
    "DOC-04": { variants: { transparent_overlay: 25, resolution_mismatch: 20, overlay: 10, docx_transparent_image: 8 }, default: 10 },
    "DOC-05": 20,
    "DOC-06": 10,
    "DOC-07": {
      variants: { javascript: 20, launch_action: 30, embedded_file: 10, submit_form: 15, macro: 30, external_template: 30, ole_object: 15 },
      default: 10,
    },
    "DOC-08": 12,
  }),
  caps: RULESET_RS_1_3.caps,
  hostCodes: RULESET_RS_1_3.hostCodes,
  absorb: RULESET_RS_1_3.absorb,
  interactions: Object.freeze([
    ...RULESET_RS_1_3.interactions,
    // DX-1: a forgery artefact combined with an impersonation or payment
    // fact. Three entries share one group (so DX-1 applies at most once)
    // because interaction variant filters apply to every code in `a`: a DOCX
    // transparent image is excluded (real Word signatures), and only a change
    // made AFTER a digital signature counts from DOC-02.
    { id: "DX-1", points: 15, group: "document-forgery", reason: "Document forgery artefact combined with an impersonation or payment request",
      a: ["DOC-04"], aVariants: ["transparent_overlay", "resolution_mismatch", "overlay"], b: DOC_FORGERY_B },
    { id: "DX-1", points: 15, group: "document-forgery", reason: "Document forgery artefact combined with an impersonation or payment request",
      a: ["DOC-05", "DOC-08"], b: DOC_FORGERY_B },
    { id: "DX-1", points: 15, group: "document-forgery", reason: "Document forgery artefact combined with an impersonation or payment request",
      a: ["DOC-02"], aVariants: ["after_signature"], b: DOC_FORGERY_B },
  ]),
  // No document-specific floor: a single heuristic structural signal (a
  // transparent/upscaled pasted image, or text drawn on a scan) forcing a
  // hard "high"/scam verdict was judged too confident for this problem
  // space - these detectors are pattern-matches on real-world documents
  // that vary widely for innocent reasons (a legitimately rescanned page,
  // a signature block added by the issuing institution's own software),
  // and unlike a URL lookalike, a false "this document is forged" carries
  // real cost. They still score real points (their own weights above, plus
  // DX-1 when combined with an impersonation/payment signal) - just never
  // an automatic floor. See docs/DOCUMENT-FORENSICS.md.
  floors: RULESET_RS_1_3.floors,
  policies: RULESET_RS_1_3.policies,
  bands: RULESET_RS_1_3.bands,
});

// rs-1.5: URL-10 (Scan This Page: a password/card form on a page claiming a
// known institution sends to another site). Weighted like a lookalike link
// and floored to "high": the page is asking for credentials on behalf of a
// bank and handing them to someone else. Everything else is rs-1.4.
export const RULESET_RS_1_5 = Object.freeze({
  ...RULESET_RS_1_4,
  version: "rs-1.5",
  weights: Object.freeze({ ...RULESET_RS_1_4.weights, "URL-10": 30 }),
  floors: Object.freeze([
    ...RULESET_RS_1_4.floors,
    { id: "FLOOR-URL10-CREDENTIAL-FORM", level: "high", reason: "A page claiming a known institution sends your password or card details to another site",
      all: ["URL-10"], requiresClaimedInstitution: true },
  ]),
});

export const ACTIVE_RULESET = RULESET_RS_1_5;
export const RULESETS = Object.freeze({
  [RULESET_RS_1_0.version]: RULESET_RS_1_0,
  [RULESET_RS_1_1.version]: RULESET_RS_1_1,
  [RULESET_RS_1_2.version]: RULESET_RS_1_2,
  [RULESET_RS_1_3.version]: RULESET_RS_1_3,
  [RULESET_RS_1_4.version]: RULESET_RS_1_4,
  [RULESET_RS_1_5.version]: RULESET_RS_1_5,
});

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
  if (w && typeof w === "object" && w.variants) return w.variants[signal.metadata?.variant] ?? w.default ?? 0;
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
  const hostCodes = ruleset.hostCodes ? new Set(ruleset.hostCodes) : HOST_CODES;
  const groups = new Map();
  for (const signal of signals) {
    const host = signal.metadata?.host;
    const key = host && hostCodes.has(signal.code) ? `host:${host}` : `code:${signal.code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(signal);
  }

  // rs-1.1+: a record-backed email finding absorbs the text / form-field
  // finding that states the same fact (EMAIL-06 <- PAY-07, EMAIL-07 <- PAY-05).
  for (const { into, from } of ruleset.absorb ?? []) {
    if (!groups.has(`code:${into}`)) continue;
    for (const code of from) {
      if (!groups.has(`code:${code}`)) continue;
      groups.get(`code:${into}`).push(...groups.get(`code:${code}`));
      groups.delete(`code:${code}`);
    }
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

  // A finding "has" a code when any of its members carries it, so a fact
  // that was merged into another finding (PAY-07 into EMAIL-06, EMAIL-04
  // into a host group) still counts for interactions and floors - once.
  const hasCode = (f, codes, variants) =>
    f.members.some((m) => codes.includes(m.code) && (!variants || variants.includes(m.metadata?.variant)));
  const present = (codes, pred = () => true, variants = null) => findings.filter((f) => hasCode(f, codes, variants) && pred(f));
  const appliedGroups = new Set();
  for (const ix of ruleset.interactions) {
    if (ix.group && appliedGroups.has(ix.group)) continue;
    const a = present(ix.a, undefined, ix.aVariants);
    // One merged fact cannot interact with itself.
    const b = present(ix.b).filter((f) => !a.includes(f));
    if (a.length === 0 || b.length === 0) continue;
    if (ix.group) appliedGroups.add(ix.group);
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

  // SOC-07 policy: the message tries to instruct automated checkers, so the
  // model reading it is not trusted to raise the level. Its findings stay
  // visible (inferred); only the level they alone would add is removed.
  if (ruleset.policies?.soc07SemanticNoRaise && present(["SOC-07"]).length > 0 && semanticSum > 0) {
    const soc07Semantic = findings.filter((f) => f.code === "SOC-07" && isSemanticOnly(f)).reduce((sum, f) => sum + f.points, 0);
    const supported = Math.min(100, lexiconSum + otherSum + Math.min(soc07Semantic, semanticSum));
    const supportedLevel = levelForScore(supported, ruleset);
    if (LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(supportedLevel)) {
      const next = ruleset.bands[LEVEL_ORDER.indexOf(supportedLevel) + 1];
      const clamped = next.min - 1;
      trace.push({ id: "POLICY-SOC07-SEMANTIC", points: clamped - total, reason: "Message contains instructions aimed at automated checkers: AI-inferred findings cannot raise the level" });
      total = clamped;
      level = supportedLevel;
    }
  }

  const nonSemantic = (f) => !isSemanticOnly(f);
  for (const floor of ruleset.floors) {
    if (!floor.all.every((c) => present([c], nonSemantic).length > 0)) continue;
    // rs-1.4+: `anyVariants` narrows `any` the way interactions' aVariants
    // narrows `a`; no earlier ruleset sets it, so their floors are unchanged.
    if (floor.any && present(floor.any, nonSemantic, floor.anyVariants ?? null).length === 0) continue;
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
