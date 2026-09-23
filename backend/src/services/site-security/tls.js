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
export async function probeTls(hostname, port = 443) {
  await assertPublicHttpUrl(`https://${hostname}/`); // re-run the SSRF guard: this connects independently of fetchOnce()'s own check

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket = _internals.connect({ host: hostname, port, servername: hostname, timeout: TLS_TIMEOUT_MS, rejectUnauthorized: false });
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      finish({
        ok: true,
        protocol: socket.getProtocol(),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError?.message,
        validFrom: cert?.valid_from ? new Date(cert.valid_from).toISOString() : undefined,
        validTo: cert?.valid_to ? new Date(cert.valid_to).toISOString() : undefined,
      });
    });
    socket.once("timeout", () => finish({ ok: false, error: "TLS connection timed out" }));
    socket.once("error", (err) => finish({ ok: false, error: err.message }));
  });
}
