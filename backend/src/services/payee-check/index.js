// Deterministic "Before paying" payee check (POST /api/check-payee).
//
// No LLM and no outbound calls. It answers only what can actually be known
// about a payee identifier:
//   - how many times FraudLens users reported it (the same `reports` table
//     /api/report and /api/check-sender use; 0 is a real answer),
//   - whether the identifier is well formed (Mauritian mobile number,
//     IBAN length + ISO 13616 mod-97 checksum, plausible account number),
//   - two context facts from what the user typed (an organisation's name on
//     a personal mobile number; a large amount).
// It cannot know who an account or number is registered to, so it never
// claims a name matches or doesn't. Nothing here is stored or logged.

import { findClaimedInstitution } from "../institutions/index.js";

export const PAYEE_METHODS = Object.freeze(["phone", "bank_account", "iban"]);
export const PAYEE_PURPOSES = Object.freeze(["car", "rent_deposit", "online_shop", "family", "invoice"]);
/** At or above this many rupees, the result notes that a transfer is hard to reverse. */
export const LARGE_AMOUNT_MUR = 50000;
const MAX_IDENTIFIER = 64;
const MAX_NAME = 100;

// Registered IBAN lengths for the countries a Mauritian payer is most likely
// to be given; other countries only get the generic format + checksum check.
const IBAN_LENGTHS = Object.freeze({ MU: 30, FR: 27, GB: 22, DE: 22, BE: 16, NL: 18, CH: 21, AE: 23 });

/**
 * @returns {{ value: { method, identifier, name?, amount?, purpose? } } | { error: string }}
 */
export function validatePayeeRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "request body must be an object" };
  const { method, identifier, name, amount, purpose } = body;
  if (!PAYEE_METHODS.includes(method)) return { error: `method must be one of: ${PAYEE_METHODS.join(", ")}` };
  if (typeof identifier !== "string" || !identifier.trim()) return { error: "identifier is required and must be a non-empty string" };
  if (identifier.length > MAX_IDENTIFIER) return { error: `identifier exceeds maximum length of ${MAX_IDENTIFIER} characters` };
  const out = { method, identifier: identifier.trim() };
  if (name !== undefined && name !== null && name !== "") {
    if (typeof name !== "string" || name.length > MAX_NAME) return { error: `name must be a string of at most ${MAX_NAME} characters` };
    if (name.trim()) out.name = name.trim();
  }
  if (amount !== undefined && amount !== null) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1e12) return { error: "amount must be a non-negative number" };
    out.amount = amount;
  }
  if (purpose !== undefined && purpose !== null) {
    if (!PAYEE_PURPOSES.includes(purpose)) return { error: `purpose must be one of: ${PAYEE_PURPOSES.join(", ")}` };
    out.purpose = purpose;
  }
  return { value: out };
}

/** ISO 13616 mod-97 check, done on digit chunks so it never needs BigInt. */
export function ibanChecksumOk(iban) {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** @returns {{ shape: "invalid" } | { shape: "ok", country: string, lengthOk: boolean|null, checksumOk: boolean }} */
export function inspectIban(raw) {
  const iban = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return { shape: "invalid" };
  const country = iban.slice(0, 2);
  const expected = IBAN_LENGTHS[country];
  return { shape: "ok", country, lengthOk: expected ? iban.length === expected : null, checksumOk: ibanChecksumOk(iban) };
}

/** Mauritian mobile numbers are 8 digits starting with 5 (optionally +230). */
export function isMauritianMobile(raw) {
  if (/[^\d\s+().-]/.test(raw)) return false;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("230")) digits = digits.slice(3);
  return digits.length === 8 && digits.startsWith("5");
}

/** Local account numbers: digits (spaces/dashes allowed), 6 to 20 of them. */
export function isPlausibleAccount(raw) {
  if (/[^\d\s-]/.test(raw)) return false;
  const n = raw.replace(/\D/g, "").length;
  return n >= 6 && n <= 20;
}

/**
 * @param {{ method, identifier, name?, amount?, purpose? }} req  validated request
 * @param {{ reportCount: number }} facts
 * @returns {{ verdict: "stop"|"caution"|"clear", findings: { code: string, severity: "red"|"amber"|"ok", params?: object }[], reportCount: number }}
 */
export function evaluatePayee(req, { reportCount }) {
  const findings = [];

  if (reportCount > 0) findings.push({ code: "REPORTED", severity: "red", params: { count: reportCount } });

  if (req.method === "iban") {
    const iban = inspectIban(req.identifier);
    if (iban.shape === "invalid") findings.push({ code: "IBAN_FORMAT_INVALID", severity: "red" });
    else if (!iban.checksumOk) findings.push({ code: "IBAN_CHECKSUM_FAILED", severity: "red", params: { country: iban.country } });
    else if (iban.lengthOk === false) findings.push({ code: "IBAN_LENGTH_WRONG", severity: "red", params: { country: iban.country } });
    else if (iban.country !== "MU") findings.push({ code: "IBAN_FOREIGN", severity: "amber", params: { country: iban.country } });
    else findings.push({ code: "IBAN_VALID", severity: "ok", params: { country: iban.country } });
  } else if (req.method === "phone") {
    findings.push(isMauritianMobile(req.identifier) ? { code: "PHONE_VALID", severity: "ok" } : { code: "PHONE_NOT_MU_MOBILE", severity: "amber" });
  } else if (!isPlausibleAccount(req.identifier)) {
    findings.push({ code: "ACCOUNT_FORMAT_ODD", severity: "amber" });
  }

  if (req.name && req.method === "phone") {
    const inst = findClaimedInstitution(req.name);
    if (inst) findings.push({ code: "ORGANISATION_ON_PERSONAL_NUMBER", severity: "amber", params: { organisation: inst.institution.display_name ?? inst.evidence.text } });
  }

  if (typeof req.amount === "number" && req.amount >= LARGE_AMOUNT_MUR) {
    findings.push({ code: "LARGE_AMOUNT", severity: "amber", params: { amount: req.amount, threshold: LARGE_AMOUNT_MUR } });
  }

  if (reportCount === 0) findings.push({ code: "NOT_REPORTED", severity: "ok" });

  const verdict = findings.some((f) => f.severity === "red") ? "stop" : findings.some((f) => f.severity === "amber") ? "caution" : "clear";
  return { verdict, findings, reportCount };
}
