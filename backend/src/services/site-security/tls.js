// Bare TLS connection (no HTTP request sent) to read the negotiated
// protocol version and the server's certificate — fetch()/undici doesn't
// expose either on its Response object. `_internals.connect` is a mutable
// seam so tests can substitute a fake socket instead of opening a real TLS
// connection (see index.test.js and url-safety.js's `_internals` for the
// same pattern applied to DNS).

import tls from "node:tls";
import { assertPublicHttpUrl } from "./url-safety.js";

export const _internals = { connect: tls.connect.bind(tls) };

const TLS_TIMEOUT_MS = Number(process.env.SITE_SECURITY_TLS_TIMEOUT_MS) || 4000;

/**
 * Resolves to { ok: true, protocol, authorized, authorizationError, validFrom, validTo }
 * on a completed handshake (even an untrusted/expired one — rejectUnauthorized
 * is off on purpose, since reporting *that* the cert is bad is the point),
 * or { ok: false, error } on any failure. Never throws.
 */
// Subject attributes only Extended Validation certificates carry (CA/B Forum
// EV Guidelines 9.2): business category and jurisdiction of incorporation.
// Node prints unrecognised OIDs by number, so both spellings are checked.
const EV_SUBJECT_KEYS = ["businessCategory", "jurisdictionC", "jurisdictionST", "jurisdictionL", "1.3.6.1.4.1.311.60.2.1.3", "1.3.6.1.4.1.311.60.2.1.2", "1.3.6.1.4.1.311.60.2.1.1"];

const first = (v) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Who the certificate says the site belongs to, from the legacy
 * getPeerCertificate() object: validation level (EV when EV-only subject
 * attributes are present, OV when an organisation is named, else DV), the
 * named organisation, the issuing CA, whether it's self-signed, and whether
 * it actually covers `hostname`.
 */
export function certificateIdentity(cert, hostname) {
  if (!cert || !cert.subject) return {};
  const subject = cert.subject;
  const organization = first(subject.O);
  const isEv = EV_SUBJECT_KEYS.some((k) => subject[k] !== undefined);
  const names = String(cert.subjectaltname || "")
    .split(/,\s*/)
    .filter((n) => n.startsWith("DNS:"))
    .map((n) => n.slice(4).toLowerCase());
  if (names.length === 0 && subject.CN) names.push(String(first(subject.CN)).toLowerCase());
  const host = hostname.toLowerCase();
  const coversHost = names.some((n) => n === host || (n.startsWith("*.") && host.endsWith(n.slice(1)) && !host.slice(0, -n.length + 1).includes(".")));
  return {
    validation: isEv ? "EV" : organization ? "OV" : "DV",
    organization,
    issuer: first(cert.issuer?.O) ?? first(cert.issuer?.CN),
    selfSigned: Boolean(cert.issuer && JSON.stringify(cert.issuer) === JSON.stringify(subject)),
    coversHost,
  };
}

export async function probeTls(hostname, port = 443, { timeout = TLS_TIMEOUT_MS } = {}) {
  await assertPublicHttpUrl(`https://${hostname}/`); // re-run the SSRF guard: this connects independently of fetchOnce()'s own check

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket = _internals.connect({ host: hostname, port, servername: hostname, timeout, rejectUnauthorized: false });
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      finish({
        ok: true,
        protocol: socket.getProtocol(),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError?.message,
        authorizationCode: socket.authorizationError?.code,
        validFrom: cert?.valid_from ? new Date(cert.valid_from).toISOString() : undefined,
        validTo: cert?.valid_to ? new Date(cert.valid_to).toISOString() : undefined,
        ...certificateIdentity(cert, hostname),
      });
    });
    socket.once("timeout", () => finish({ ok: false, error: "TLS connection timed out" }));
    socket.once("error", (err) => finish({ ok: false, error: err.message }));
  });
}
