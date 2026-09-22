import { getCachedDomainRegistration, cacheDomainRegistration } from "../../db/index.js";

const LOOKUP_TIMEOUT_MS = Number(process.env.DOMAIN_AGE_TIMEOUT_MS) || 1500;

function daysSince(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

async function fetchRegistrationDate(domain) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, { signal: controller.signal });
    if (!res.ok) return undefined;
    const data = await res.json();
    const event = Array.isArray(data.events) && data.events.find((e) => e.eventAction === "registration");
    return event?.eventDate;
  } finally {
    clearTimeout(timer);
  }
}

// Best-effort, non-blocking domain-age enrichment for lookalike_url signals.
// Never throws and never takes longer than LOOKUP_TIMEOUT_MS: any failure or
// timeout resolves to undefined so the caller omits domainAgeDays entirely
// rather than surfacing an error or blocking /api/analyze (see CLAUDE.md
// "Judging Priorities" - reliability of the core verdict outranks this).
export async function getDomainAgeDays(domain) {
  try {
    const cached = getCachedDomainRegistration(domain);
    if (cached) return daysSince(cached);

    const registeredAt = await fetchRegistrationDate(domain);
    if (!registeredAt) return undefined;

    cacheDomainRegistration(domain, registeredAt);
    return daysSince(registeredAt);
  } catch {
    return undefined;
  }
}

// Kicks off a best-effort domainAgeDays lookup per lookalike_url signal and
// returns a function that attaches whichever lookups already resolved.
// Deliberately NOT awaited here: the caller starts these lookups, then does
// its own (much slower) work, e.g. the LLM call in
// backend/src/routes/index.js - by the time the caller is ready to attach
// results, each lookup has usually either already resolved or is still
// capped by its own LOOKUP_TIMEOUT_MS. The caller must call the returned
// function only once, right before sending the response, and must never
// await its readiness - that's what keeps this non-blocking.
export function attachDomainAges(urlSignals, hosts) {
  const ages = new Array(hosts.length).fill(undefined);
  hosts.forEach((host, i) => {
    getDomainAgeDays(host)
      .then((days) => {
        ages[i] = days;
      })
      .catch(() => {});
  });
  return () => {
    urlSignals.forEach((signal, i) => {
      if (typeof ages[i] === "number") signal.domainAgeDays = ages[i];
    });
  };
}
