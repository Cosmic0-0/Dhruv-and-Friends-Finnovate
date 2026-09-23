// Separates two questions the security grade alone can't: is this site
// BADLY BUILT (missing headers, old libraries - common on older and
// government sites) or is it HOSTILE (phishing, malware, impersonation)?
//
// The grade measures engineering hygiene. Intent comes from reputation facts
// (services/url-reputation - the same assessment the extension runs on every
// page): threat lists, lookalike domains, tunnel hosts, certificate history
// and domain age. A site can be poorly secured and completely legitimate, and
// a phishing kit on a fresh domain can score an A for headers.
//
//   malicious      a hard reputation fact: known phishing/malware list, a
//                  lookalike of a real institution or brand, a tunnel host, or
//                  a lookalike with a brand-new certificate
//   suspicious     softer identity problems: brand-new domain, repeated user
//                  reports, an invalid certificate, a raw-IP address
//   weak_security  no sign of bad intent, but the security setup has real gaps
//   ok             no sign of bad intent and a reasonable security setup

const HOSTILE_CODES = new Set(["REP-05", "URL-01", "URL-02", "URL-04", "URL-07", "URL-11", "CERT-02"]);
const SUSPICIOUS_CODES = new Set(["URL-03", "URL-06", "URL-09", "REP-03", "CERT-01"]);
const WEAK_GRADES = new Set(["D", "E", "F"]);
const GOV_SUFFIXES = [".gov.mu", ".govmu.org"];
const YEAR_DAYS = 365;

const HEADLINE = {
  malicious: "Likely phishing or malware. Don't enter anything on this site.",
  suspicious: "Suspicious: this site's identity doesn't fully check out.",
  weak_security: "Poorly secured, but no sign of fraud.",
  ok: "No sign of fraud, and the security setup is reasonable.",
};

const EXPLANATION = {
  malicious: "These findings are about who runs the site, not how well it's built. A well-configured site can still be a scam.",
  suspicious: "Nothing proves it's a scam, but the usual signs of an established, genuine site are missing or wrong.",
  weak_security:
    "The technical gaps below are common on older and government websites. They make the site easier to attack, but nothing suggests it is impersonating anyone or listed as malicious.",
  ok: "Nothing suggests bad intent. See the checks below for the details that were tested.",
};

function isGovernmentHost(host) {
  return GOV_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s));
}

/** Reasons to believe the site is what it says it is. */
function trustFacts(reputation) {
  const facts = [];
  if (reputation.officialInstitution) facts.push(`Official website of ${reputation.officialInstitution}.`);
  if (reputation.host && isGovernmentHost(reputation.host)) facts.push("Government of Mauritius domain.");
  if (typeof reputation.domainAgeDays === "number" && reputation.domainAgeDays >= YEAR_DAYS) {
    const years = Math.floor(reputation.domainAgeDays / YEAR_DAYS);
    facts.push(`Domain registered ${years} year${years === 1 ? "" : "s"} ago.`);
  } else if (reputation.domainAgeDays == null && typeof reputation.firstCertificateDays === "number" && reputation.firstCertificateDays >= YEAR_DAYS) {
    facts.push(`In public certificate logs for over ${Math.floor(reputation.firstCertificateDays / YEAR_DAYS)} year(s).`);
  }
  const cert = reputation.certificate;
  if (cert && !cert.problem && (cert.validation === "EV" || cert.validation === "OV") && cert.organization) {
    facts.push(`Certificate issued to ${cert.organization} (${cert.validation === "EV" ? "Extended Validation" : "organisation validated"}).`);
  }
  if (!reputation.signals.some((s) => s.code === "REP-05")) facts.push("Not on any phishing or malware list FraudLens checks.");
  return facts;
}

/**
 * @param {{ reputation: object|null, grade: string, findings: object[] }} input
 *   reputation is a /api/check-url assessment (services/url-reputation), or null when unavailable
 * @returns {{ kind: string, headline: string, explanation: string, reasons: string[], trustFacts: string[], reputationChecked: boolean }}
 */
export function classifySiteIntent({ reputation, grade, findings }) {
  if (!reputation) {
    return {
      kind: WEAK_GRADES.has(grade) ? "weak_security" : "ok",
      headline: WEAK_GRADES.has(grade) ? "Poorly secured. Reputation checks were unavailable." : "Reputation checks were unavailable.",
      explanation: "FraudLens couldn't check this site's reputation, so this report only describes how it's built, not who runs it.",
      reasons: [],
      trustFacts: [],
      reputationChecked: false,
    };
  }
  const signals = reputation.signals ?? [];
  const hostile = signals.filter((s) => HOSTILE_CODES.has(s.code) || (s.code === "URL-03" && s.severity === "high"));
  const soft = signals.filter((s) => SUSPICIOUS_CODES.has(s.code) && !hostile.includes(s));
  const hasSeriousGap = findings.some((f) => f.severity === "high");

  let kind = "ok";
  if (hostile.length > 0) kind = "malicious";
  else if (soft.length > 0) kind = "suspicious";
  else if (WEAK_GRADES.has(grade) || hasSeriousGap) kind = "weak_security";

  const reasons = (kind === "malicious" ? hostile : kind === "suspicious" ? soft : []).map((s) => s.description).filter(Boolean);
  return {
    kind,
    headline: HEADLINE[kind],
    explanation: EXPLANATION[kind],
    reasons,
    trustFacts: kind === "malicious" ? [] : trustFacts(reputation),
    reputationChecked: true,
  };
}
