// Non-LLM, deterministic - trusted WORKPLACE reference data for the email
// detectors (services/email-signals): known suppliers (domains, addresses,
// payees, masked bank accounts) and the organisation's own directory
// (domains, executives / finance staff).
//
// DEMO DATA: both files under data/ are fictional seed data on the reserved
// .example TLD (see each file's `notes`). Kept separate from the financial-
// institution registry on purpose: a supplier is not a bank, and nothing in
// here may be presented as a real verified business. A real deployment swaps
// these files for the organisation's vendor master / directory export.

import { readFileSync } from "node:fs";
import { compareDomains, impersonationTechnique } from "../domain-matching/index.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../../../../data/${name}`, import.meta.url), "utf8"));
// A real deployment points ORG_PROFILE_PATH at its own profile JSON (same shape).
const loadProfile = () =>
  process.env.ORG_PROFILE_PATH ? JSON.parse(readFileSync(process.env.ORG_PROFILE_PATH, "utf8")) : load("demo-organisation-directory.json");

const NAME_STOPWORDS = new Set(["ltd", "limited", "co", "company", "inc", "plc", "sarl", "ltee", "llc", "the", "and", "services"]);

/** "ABC Supplies Ltd." -> "abc supplies"; accents stripped, punctuation -> space. */
export function nameKey(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !NAME_STOPWORDS.has(t))
    .join(" ");
}

function freezeSupplier(s) {
  const keys = [...new Set([s.name, ...(s.aliases ?? [])].map(nameKey).filter((k) => k.length >= 4))];
  return Object.freeze({
    ...s,
    domains: (s.domains ?? []).map((d) => d.toLowerCase()),
    knownEmailAddresses: (s.knownEmailAddresses ?? []).map((a) => a.toLowerCase()),
    knownBeneficiaries: s.knownBeneficiaries ?? [],
    knownAccountLast4: (s.bankAccounts ?? []).map((a) => String(a.masked ?? "").replace(/\D/g, "").slice(-4)).filter((d) => d.length === 4),
    nameKeys: keys,
  });
}

export function buildSupplierRegistry(raw) {
  return Object.freeze({ version: raw.version, suppliers: Object.freeze(raw.suppliers.map(freezeSupplier)) });
}

/**
 * The organisation profile: protected domains + brand tokens, directory
 * (people with roles), role mailboxes (finance / payroll / IT), where to
 * report phishing, and the organisation's own verification workflows.
 * Every field is optional - a profile with only domains still protects them.
 */
export function buildOrganisationProfile(raw) {
  const organisationDomains = (raw.organisationDomains ?? []).map((d) => d.toLowerCase());
  const brandTokens = [...new Set((raw.brandTokens ?? []).map((t) => t.toLowerCase()).filter((t) => t.length >= 5))];
  return Object.freeze({
    version: raw.version ?? "custom",
    organisationId: raw.organisationId ?? organisationDomains[0] ?? "default",
    organisationName: raw.organisationName ?? null,
    organisationDomains: Object.freeze(organisationDomains),
    brandTokens: Object.freeze(brandTokens),
    reportPhishingTo: raw.reportPhishingTo ?? null,
    people: Object.freeze(
      (raw.people ?? []).map((p) =>
        Object.freeze({ ...p, role: p.role ?? "employee", emails: (p.emails ?? []).map((e) => e.toLowerCase()), nameTokens: nameKey(p.name).split(" ").filter(Boolean) })
      )
    ),
    roleMailboxes: Object.freeze(
      (raw.roleMailboxes ?? []).map((r) =>
        Object.freeze({ function: r.function, labelKeys: (r.labels ?? []).map(nameKey).filter(Boolean), addresses: (r.addresses ?? []).map((a) => a.toLowerCase()) })
      )
    ),
    verificationWorkflows: Object.freeze(raw.verificationWorkflows ?? []),
    demo: /^demo/.test(raw.version ?? ""),
  });
}
/** @deprecated name kept for existing callers - the directory is part of the organisation profile. */
export const buildDirectory = buildOrganisationProfile;

export const DEMO_SUPPLIERS = buildSupplierRegistry(load("demo-supplier-registry.json"));
export const DEMO_ORGANISATION = buildOrganisationProfile(loadProfile());
export const DEMO_DIRECTORY = DEMO_ORGANISATION;

const containsKey = (hay, key) => ` ${hay} `.includes(` ${key} `);

/** The supplier whose name/alias appears (whole words) in `text`, or null. */
export function findSupplierByName(text, registry = DEMO_SUPPLIERS) {
  const hay = nameKey(text);
  if (!hay) return null;
  return registry.suppliers.find((s) => s.nameKeys.some((k) => containsKey(hay, k))) ?? null;
}

/**
 * The supplier a sender domain belongs to ("same"/"sibling") or imitates
 * ("lookalike"), with the trusted domain it was compared against.
 * @returns {{ supplier: object, relation: "same"|"sibling"|"lookalike", trustedDomain: string } | null}
 */
export function findSupplierByDomain(domain, registry = DEMO_SUPPLIERS) {
  if (!domain) return null;
  let lookalike = null;
  for (const supplier of registry.suppliers) {
    for (const trustedDomain of supplier.domains) {
      const relation = compareDomains(domain, trustedDomain);
      if (relation === "same" || relation === "sibling") return { supplier, relation, trustedDomain };
      if (relation === "lookalike" && !lookalike) lookalike = { supplier, relation, trustedDomain };
    }
  }
  return lookalike;
}

// Order of preference when several protected domains / tokens match.
const TECHNIQUE_RANK = ["homoglyph", "label_split", "subdomain_abuse", "confusable", "typo", "tld_swap", "brand_embedded"];

/**
 * How `domain` relates to the organisation's own protected domains and
 * brand tokens: { relation: "same" } for our own (sub)domains, { relation:
 * "lookalike", technique, trustedDomain } for an imitation (see
 * domain-matching.impersonationTechnique), or null for anything else.
 * Brand tokens are compared as a registrable label under any suffix, so a
 * token "aspire" protects against aspire.co and aspire-login.com too.
 */
export function organisationDomainRelation(domain, directory = DEMO_ORGANISATION) {
  if (!domain) return null;
  let best = null;
  for (const d of directory.organisationDomains) {
    const relation = compareDomains(domain, d);
    if (relation === "same" || relation === "sibling") return { relation: "same", trustedDomain: d };
  }
  const references = [
    ...directory.organisationDomains.map((d) => ({ compareTo: d, trustedDomain: d })),
    ...directory.brandTokens.map((t) => ({ compareTo: `${t}.invalid`, trustedDomain: directory.organisationDomains[0] ?? t })),
  ];
  for (const { compareTo, trustedDomain } of references) {
    const technique = impersonationTechnique(domain, compareTo);
    if (technique && (!best || TECHNIQUE_RANK.indexOf(technique) < TECHNIQUE_RANK.indexOf(best.technique))) {
      best = { relation: "lookalike", technique, trustedDomain };
    }
  }
  return best;
}

/** The organisation role function (finance / payroll / it / ...) a display name claims, or null. */
export function findRoleClaim(displayName, directory = DEMO_ORGANISATION) {
  const hay = nameKey(displayName);
  if (!hay) return null;
  for (const role of directory.roleMailboxes) {
    const label = role.labelKeys.find((k) => ` ${hay} `.includes(` ${k} `));
    if (label) return { function: role.function, label, addresses: role.addresses };
  }
  return null;
}

/** Does the display name mention the organisation itself (name or brand token)? */
export function mentionsOrganisation(displayName, directory = DEMO_ORGANISATION) {
  const hay = nameKey(displayName);
  if (!hay) return false;
  const keys = [nameKey(directory.organisationName), ...directory.brandTokens.map(nameKey)].filter((k) => k.length >= 4);
  return keys.some((k) => ` ${hay} `.includes(` ${k} `) || hay.replace(/ /g, "").includes(k.replace(/ /g, "")));
}

/** A directory person whose full name (every token, >= 2 tokens) appears in `displayName`. */
export function findPersonByName(displayName, directory = DEMO_ORGANISATION) {
  const tokens = new Set(nameKey(displayName).split(" ").filter(Boolean));
  if (tokens.size === 0) return null;
  return directory.people.find((p) => p.nameTokens.length >= 2 && p.nameTokens.every((t) => tokens.has(t))) ?? null;
}
