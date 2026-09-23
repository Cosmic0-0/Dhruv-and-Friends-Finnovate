// URL-10: on a scanned page (the extension's "Scan This Page"), a password or
// card form that sends your details to another site while the page presents
// itself as a known institution. Deterministic.
//
// The extension reports only each sensitive form's destination host and field
// kinds - never field values. Deliberately narrow, because a page merely
// MENTIONING a bank (a news article about MCB) also "claims" it in the text:
//   - the form must submit cross-site (a site's own login form never fires),
//   - not to the institution's official domain,
//   - not to a trusted-domains host (SSO like accounts.google.com),
//   - and never on the institution's own official site.

import { isOfficialHost, normalizeHost } from "../institutions/index.js";
import { isSameSite, isTrustedDomain } from "../domain-matching/index.js";
import { makeSignal } from "../signals/registry.js";

export const MAX_PAGE_FORMS = 10;
const MAX_HOST_LENGTH = 253;
const HOSTNAME_RE = /^[a-z0-9.-]+$/;

/**
 * Validates the optional `pageForms` field of POST /api/analyze.
 * @returns {{ value: {actionHost: string|null, hasPassword: boolean, hasCard: boolean}[] | null } | { error: string }}
 */
export function validatePageForms(raw) {
  if (raw === undefined || raw === null) return { value: null };
  if (!Array.isArray(raw) || raw.length > MAX_PAGE_FORMS) return { error: `pageForms must be an array of at most ${MAX_PAGE_FORMS} forms` };
  const value = [];
  for (const form of raw) {
    if (!form || typeof form !== "object") return { error: "pageForms entries must be objects" };
    const { actionHost } = form;
    let host = null;
    if (actionHost !== null && actionHost !== undefined) {
      if (typeof actionHost !== "string" || actionHost.length > MAX_HOST_LENGTH) return { error: "pageForms[].actionHost must be a hostname" };
      host = normalizeHost(actionHost);
      if (!HOSTNAME_RE.test(host)) return { error: "pageForms[].actionHost must be a hostname" };
    }
    value.push({ actionHost: host, hasPassword: form.hasPassword === true, hasCard: form.hasCard === true });
  }
  return { value };
}

const isInstitutionHost = (host, institution) => institution.official_domains.some((d) => isOfficialHost(host, d));

/**
 * @param {{actionHost: string|null, hasPassword: boolean, hasCard: boolean}[] | null} pageForms
 * @param {{ pageHost: string|null, claimedInstitution: object|null }} context
 * @returns {object[]} URL-10 signals, one per destination host
 */
export function checkPageForms(pageForms, { pageHost, claimedInstitution }) {
  if (!pageForms?.length || !pageHost || !claimedInstitution) return [];
  if (isInstitutionHost(pageHost, claimedInstitution)) return [];

  const byHost = new Map(); // destination host -> field kinds
  for (const form of pageForms) {
    if (!form.hasPassword && !form.hasCard) continue;
    const target = form.actionHost ?? pageHost;
    if (isSameSite(target, pageHost) || isInstitutionHost(target, claimedInstitution) || isTrustedDomain(target)) continue;
    const kinds = byHost.get(target) ?? new Set();
    if (form.hasPassword) kinds.add("password");
    if (form.hasCard) kinds.add("card");
    byHost.set(target, kinds);
  }

  const name = claimedInstitution.display_name;
  const official = claimedInstitution.official_domains[0];
  return [...byHost].map(([host, kinds]) => {
    const fields = [...kinds];
    return makeSignal("URL-10", {
      sourceType: "rule",
      evidence: host,
      description: `This page presents itself as ${name}, but its ${fields.join(" and ")} form sends what you type to ${host}, which is not ${name}'s site (${official}).`,
      metadata: { host, pageHost, institutionId: claimedInstitution.id, fields },
      extra: { domain: host, officialDomain: official },
    });
  });
}
