// Non-LLM, deterministic evaluation of structured payment context
// (SafePay / "Before you pay"). These are facts the user entered in form
// fields - they are validated and evaluated in code, never flattened into
// prose for the LLM to interpret.

import { findClaimedInstitution } from "../institutions/index.js";
import { makeSignal } from "../signals/registry.js";

export const PAYMENT_METHODS = Object.freeze([
  "bank_transfer", "mobile_money", "card", "cash", "cheque", "gift_card", "voucher", "crypto", "money_transfer_service", "other",
]);
const UNUSUAL_METHODS = new Set(["gift_card", "voucher", "crypto", "money_transfer_service"]);
const MAX_TEXT = 200;

const NAME_STOPWORDS = new Set(["ltd", "limited", "co", "company", "inc", "plc", "sarl", "ltee", "the", "and", "de", "la", "le", "mr", "mrs", "ms"]);

function tokens(name) {
  return new Set(
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2 && !NAME_STOPWORDS.has(t))
  );
}

/** Does the recipient plausibly name the same party as the claimed organisation? */
export function namesMatch(recipient, claimed) {
  const instA = findClaimedInstitution(recipient)?.institution.id;
  const instB = findClaimedInstitution(claimed)?.institution.id;
  if (instA && instB) return instA === instB;
  const a = tokens(recipient);
  const b = tokens(claimed);
  if (a.size === 0 || b.size === 0) return true; // nothing comparable -> no finding
  return [...a].some((t) => b.has(t));
}

/**
 * Validates the optional `paymentContext` request field.
 * @returns {{ value: object|null } | { error: string }}
 */
export function validatePaymentContext(raw) {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "paymentContext must be an object" };
  const out = {};
  if (raw.amount !== undefined) {
    if (typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount < 0) return { error: "paymentContext.amount must be a non-negative number" };
    out.amount = raw.amount;
  }
  for (const key of ["currency", "recipient", "claimedOrganisation"]) {
    if (raw[key] === undefined || raw[key] === null) continue;
    if (typeof raw[key] !== "string" || raw[key].length > MAX_TEXT) return { error: `paymentContext.${key} must be a string of at most ${MAX_TEXT} characters` };
    if (raw[key].trim()) out[key] = raw[key].trim();
  }
  if (raw.method !== undefined && raw.method !== null) {
    if (!PAYMENT_METHODS.includes(raw.method)) return { error: `paymentContext.method must be one of: ${PAYMENT_METHODS.join(", ")}` };
    out.method = raw.method;
  }
  // Only the last 4 digits are kept - enough to compare against a supplier's
  // masked account on record (EMAIL-06), never a full account number.
  if (raw.accountNumber !== undefined && raw.accountNumber !== null && raw.accountNumber !== "") {
    const digits = typeof raw.accountNumber === "string" && raw.accountNumber.length <= 40 ? raw.accountNumber.replace(/\D/g, "") : "";
    if (digits.length < 4) return { error: "paymentContext.accountNumber must be a string containing at least 4 digits" };
    out.accountLast4 = digits.slice(-4);
  }
  if (raw.onCallNow !== undefined && raw.onCallNow !== null) {
    if (typeof raw.onCallNow !== "boolean") return { error: "paymentContext.onCallNow must be a boolean" };
    out.onCallNow = raw.onCallNow;
  }
  return { value: out };
}

/** PAY-02 / PAY-05 / PAY-06 from validated payment context. */
export function evaluatePaymentContext(ctx) {
  if (!ctx) return [];
  const signals = [];
  if (ctx.method && UNUSUAL_METHODS.has(ctx.method)) {
    signals.push(
      makeSignal("PAY-02", {
        sourceType: "rule",
        evidence: `payment method: ${ctx.method}`,
        description: `You said you are paying by ${ctx.method.replace(/_/g, " ")} - a method scammers prefer because it cannot be reversed.`,
        metadata: { field: "paymentContext.method", method: ctx.method },
      })
    );
  }
  if (ctx.recipient && ctx.claimedOrganisation && !namesMatch(ctx.recipient, ctx.claimedOrganisation)) {
    signals.push(
      makeSignal("PAY-05", {
        sourceType: "rule",
        evidence: `recipient "${ctx.recipient}" vs claimed "${ctx.claimedOrganisation}"`,
        description: `The money would go to "${ctx.recipient}", but the request claims to come from "${ctx.claimedOrganisation}".`,
        metadata: { field: "paymentContext.recipient", recipient: ctx.recipient, claimedOrganisation: ctx.claimedOrganisation },
        extra: { beneficiary: ctx.recipient },
      })
    );
  }
  if (ctx.onCallNow === true) {
    signals.push(
      makeSignal("PAY-06", {
        sourceType: "rule",
        evidence: "on a call while paying: yes",
        description: "Someone is on the phone or messaging you while you make this payment - a hallmark of coached scams.",
        metadata: { field: "paymentContext.onCallNow" },
      })
    );
  }
  return signals;
}
