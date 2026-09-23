import { getCachedDomainRegistration, cacheDomainRegistration } from "../../db/index.js";

const LOOKUP_TIMEOUT_MS = Number(process.env.DOMAIN_AGE_TIMEOUT_MS) || 1500;
const LOOKUP_HEADERS = Object.freeze({ accept: "application/rdap+json, application/json", "user-agent": "FraudLens/1.0 (domain-age check)" });

function daysSince(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

async function fetchRegistrationDate(domain) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    // rdap.org answers Node's default request (no User-Agent) with a 403 HTML
    // page, so without these headers every lookup silently came back empty.
    const res = await fetch(`https://rdap.org/domain/${domain}`, { signal: controller.signal, headers: LOOKUP_HEADERS });
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

// Certificate Transparency fallback for domains RDAP can't date (a registry
// without RDAP, or rdap.org slow/down): days since the domain's FIRST certificate
// was logged, via crt.sh. That's when the site first had HTTPS - not its
// registration date - so callers must word it that way. Same timeout, never
// throws, cached in memory.
const CERT_CACHE = new Map(); // domain -> ISO date of first certificate
const MAX_CERT_CACHE = 2000;

async function fetchFirstCertificateDate(domain, fetchImpl) {
  const res = await fetchImpl(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&deduplicate=Y`, {
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    headers: LOOKUP_HEADERS,
  });
  if (!res.ok) return undefined;
  const entries = await res.json();
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  const earliest = Math.min(...entries.map((e) => Date.parse(e?.not_before)).filter(Number.isFinite));
  return Number.isFinite(earliest) ? new Date(earliest).toISOString() : undefined;
}

export async function getCertificateAgeDays(domain, { fetchImpl = fetch } = {}) {
  try {
    const cached = CERT_CACHE.get(domain);
    if (cached) return daysSince(cached);
    const firstSeen = await fetchFirstCertificateDate(domain, fetchImpl);
    if (!firstSeen) return undefined;
    if (CERT_CACHE.size >= MAX_CERT_CACHE) CERT_CACHE.delete(CERT_CACHE.keys().next().value);
    CERT_CACHE.set(domain, firstSeen);
    return daysSince(firstSeen);
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
