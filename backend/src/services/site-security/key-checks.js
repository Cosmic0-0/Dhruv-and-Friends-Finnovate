// The handful of checks that actually separate a phishing or malware site
// from a merely badly built one, in the order a person should read them:
// certificate ("green bar"), domain age, lookalike domain, threat lists,
// page metadata, privacy policy, phishing-kit code. The report shows these
// first; the security-hygiene checks follow.
//
// status: pass | warn | fail | neutral (a fact, not a verdict) | unknown

const YEAR_DAYS = 365;
const NEW_DAYS = 30;
const LOOKALIKE_CODES = ["URL-01", "URL-02", "URL-03", "URL-04", "URL-07"];

const PROBLEM_TEXT = {
  expired: "The certificate has expired.",
  not_yet_valid: "The certificate isn't valid yet.",
  self_signed: "Self-signed: no certificate authority vouches for it.",
  wrong_host: "The certificate was issued for a different website.",
  untrusted: "Not issued by a trusted certificate authority.",
};

function ageText(days) {
  if (days < 1) return "today";
  if (days < 60) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 2 * YEAR_DAYS) return `${Math.round(days / 30)} months ago`;
  return `${Math.floor(days / YEAR_DAYS)} years ago`;
}

function certificateCheck(reputation, isHttps) {
  const base = { id: "certificate", label: "Certificate" };
  if (!isHttps) return { ...base, status: "fail", value: "None", detail: "The site isn't served over HTTPS, so nothing you type is encrypted." };
  const cert = reputation?.certificate;
  if (!cert) return { ...base, status: "unknown", value: "Not read", detail: "FraudLens couldn't read the certificate this time." };
  if (cert.problem) return { ...base, status: "fail", value: "Invalid", detail: PROBLEM_TEXT[cert.problem] ?? "The certificate is not valid." };
  if (cert.validation === "EV" && cert.organization) {
    return { ...base, status: "pass", value: `Verified: ${cert.organization}`, detail: `Extended Validation. ${cert.issuer ?? "The certificate authority"} checked this company's legal identity. This is what the old green address bar showed.` };
  }
  if (cert.validation === "OV" && cert.organization) {
    return { ...base, status: "pass", value: `Issued to ${cert.organization}`, detail: `Organisation validated by ${cert.issuer ?? "the certificate authority"}.` };
  }
  return { ...base, status: "neutral", value: "Domain only", detail: "Proves the connection is encrypted, not who runs the site. These are free and instant, so scam sites use them too." };
}

function domainAgeCheck(reputation) {
  const base = { id: "domain-age", label: "Domain age" };
  if (reputation?.officialInstitution) return { ...base, status: "pass", value: "Established", detail: `Official ${reputation.officialInstitution} domain.` };
  const days = reputation?.domainAgeDays;
  if (typeof days === "number") {
    const status = days < NEW_DAYS ? "fail" : days < YEAR_DAYS ? "warn" : "pass";
    return { ...base, status, value: `Registered ${ageText(days)}`, detail: status === "fail" ? "Scam sites are usually set up days before they're used." : status === "warn" ? "Less than a year old. Not proof of anything, but worth weighing." : "A long-registered domain." };
  }
  const ct = reputation?.firstCertificateDays;
  if (typeof ct === "number") {
    return { ...base, status: ct < NEW_DAYS ? "fail" : "neutral", value: `First seen ${ageText(ct)}`, detail: "From public certificate logs; the registration date wasn't available." };
  }
  return { ...base, status: "unknown", value: "Unknown", detail: "The registration date couldn't be looked up." };
}

function lookalikeCheck(reputation) {
  const base = { id: "lookalike", label: "Domain name" };
  if (!reputation) return { ...base, status: "unknown", value: "Not checked", detail: "Reputation checks were unavailable." };
  if (reputation.officialInstitution) return { ...base, status: "pass", value: `Official ${reputation.officialInstitution}`, detail: "This address belongs to the institution itself." };
  const hit = reputation.signals.find((s) => LOOKALIKE_CODES.includes(s.code));
  if (hit) return { ...base, status: "fail", value: "Imitates another site", detail: hit.description };
  const tunnel = reputation.signals.find((s) => s.code === "URL-11");
  if (tunnel) return { ...base, status: "fail", value: "Temporary host", detail: tunnel.description };
  return { ...base, status: "pass", value: "No imitation found", detail: "Doesn't imitate a Mauritian bank, telecom or government domain, or a major global brand." };
}

function threatListCheck(reputation) {
  const base = { id: "threat-lists", label: "Threat lists" };
  if (!reputation) return { ...base, status: "unknown", value: "Not checked", detail: "Reputation checks were unavailable." };
  const hit = reputation.signals.find((s) => s.code === "REP-05");
  if (hit) return { ...base, status: "fail", value: "Listed", detail: hit.description };
  const reports = reputation.signals.find((s) => s.code === "REP-03");
  if (reports) return { ...base, status: "warn", value: "Reported by users", detail: reports.description };
  return { ...base, status: "pass", value: "Not listed", detail: "Not on the phishing or malware lists FraudLens checks." };
}

function metadataCheck(identityFindings, hasMeta, reputation) {
  const base = { id: "metadata", label: "Page metadata" };
  if (!hasMeta) return { ...base, status: "unknown", value: "Not read", detail: "The extension couldn't read this page." };
  const hit = identityFindings.find((f) => f.hostile && /metadata|claims to be/i.test(f.title));
  if (hit) return { ...base, status: "fail", value: "Claims another identity", detail: hit.description };
  if (reputation?.officialInstitution) return { ...base, status: "pass", value: "Consistent", detail: `Title and metadata match the official ${reputation.officialInstitution} site.` };
  return { ...base, status: "pass", value: "Consistent", detail: "The title, site name and canonical link don't claim another organisation." };
}

function privacyCheck(privacy) {
  const base = { id: "privacy-policy", label: "Privacy policy" };
  switch (privacy?.status) {
    case "found":
      return { ...base, status: "pass", value: "Published", detail: "Links to its own privacy policy, and the page loads.", ...(privacy.url ? { url: privacy.url } : {}) };
    case "missing":
      return { ...base, status: "warn", value: "None linked", detail: "No privacy policy link on this page. Common on scam pages, but also on neglected sites." };
    case "broken":
      return { ...base, status: "warn", value: "Broken link", detail: "The privacy policy link doesn't load.", url: privacy.url };
    case "foreign":
      return { ...base, status: "fail", value: `Copied from ${privacy.owner}`, detail: "The link goes to another organisation's policy, as it would on a cloned page.", url: privacy.url };
    default:
      return { ...base, status: "unknown", value: "Not checked", detail: "The page's links couldn't be read." };
  }
}

function kitCodeCheck(identityFindings, hasMeta) {
  const base = { id: "kit-code", label: "Phishing-kit code" };
  if (!hasMeta) return { ...base, status: "unknown", value: "Not read", detail: "The extension couldn't read this page." };
  const hit = identityFindings.find((f) => f.hostile && /sends data to|branding from/i.test(f.title));
  if (hit) return { ...base, status: "fail", value: "Found", detail: hit.description };
  const hidden = identityFindings.find((f) => /obfuscated/i.test(f.title));
  if (hidden) return { ...base, status: "warn", value: "Hidden code", detail: hidden.description };
  return { ...base, status: "pass", value: "None found", detail: "No data sent to Telegram or Discord, and no branding borrowed from a real institution." };
}

/**
 * @param {{ reputation: object|null, identityFindings: object[], privacy: object|null, hasMeta: boolean, isHttps: boolean }} input
 */
export function buildKeyChecks({ reputation, identityFindings, privacy, hasMeta, isHttps }) {
  return [
    certificateCheck(reputation, isHttps),
    domainAgeCheck(reputation),
    lookalikeCheck(reputation),
    threatListCheck(reputation),
    metadataCheck(identityFindings, hasMeta, reputation),
    privacyCheck(privacy),
    kitCodeCheck(identityFindings, hasMeta),
  ];
}
