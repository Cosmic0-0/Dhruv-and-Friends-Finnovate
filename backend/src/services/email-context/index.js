// Non-LLM, deterministic validation + normalisation of the optional
// `emailContext` request field (Outlook / email-client metadata).
//
// Rules this module enforces:
// - Every field is optional. A missing field becomes null / [] and means
//   "not supplied" - it is NEVER treated as suspicious downstream.
// - Authentication results are reduced to a closed enum. A value the client
//   sends that we do not recognise becomes "unknown" (not "fail").
// - Addresses are validated and normalised here (lower-cased, domain in
//   Unicode + ASCII form) so detectors compare facts, never raw strings.
// - Nothing here is sent to the LLM. Metadata is compared by code only
//   (services/email-signals); the model only ever sees the message body.
//
// A malformed type (e.g. `from` is a number) is a 400: the client is broken.
// A well-typed but unusable value (an address that does not parse) is a 400
// too, because silently dropping it would hide a client bug.

import { domainToASCII, domainToUnicode } from "node:url";

export const AUTH_RESULTS = Object.freeze(["pass", "fail", "softfail", "neutral", "none", "temperror", "permerror", "unknown"]);
const AUTH_KEYS = Object.freeze(["spf", "dkim", "dmarc"]);

const MAX_NAME = 200;
const MAX_ADDRESS = 254;
const MAX_SUBJECT = 500;
const MAX_REPLY_TO = 10;
const MAX_ATTACHMENTS = 25;
const MAX_URLS = 50;
const MAX_URL = 2048;
const MAX_PREVIOUS_SENDERS = 50;
const MAX_MESSAGE_ID = 300;

// local@domain, no whitespace / angle brackets / commas; domain needs a dot.
const ADDRESS_RE = /^([^\s@<>(),;:"\\]+)@([^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+)$/u;

/**
 * Parses and normalises one address. Returns null when it does not parse.
 * @returns {{ address: string, local: string, domain: string, asciiDomain: string } | null}
 */
export function normalizeAddress(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^<|>$/g, "").normalize("NFKC");
  if (trimmed.length === 0 || trimmed.length > MAX_ADDRESS) return null;
  const m = ADDRESS_RE.exec(trimmed);
  if (!m) return null;
  const local = m[1].toLowerCase();
  const rawDomain = m[2].toLowerCase().replace(/\.$/, "");
  const asciiDomain = domainToASCII(rawDomain);
  if (!asciiDomain) return null;
  const domain = domainToUnicode(asciiDomain) || rawDomain;
  return { address: `${local}@${domain}`, local, domain, asciiDomain };
}

function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFKC").replace(/^["']+|["']+$/g, "").replace(/\s+/g, " ").trim();
  return name ? name.slice(0, MAX_NAME) : null;
}

/** `{ name?, address? }` or a bare address string -> { name, ...address } | error. */
function parseMailbox(raw, field) {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw === "string") raw = { address: raw };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: `${field} must be an object { name, address } or an address string` };
  if (raw.name !== undefined && raw.name !== null && (typeof raw.name !== "string" || raw.name.length > MAX_NAME)) {
    return { error: `${field}.name must be a string of at most ${MAX_NAME} characters` };
  }
  const name = cleanName(raw.name);
  if (raw.address === undefined || raw.address === null || raw.address === "") {
    return { value: name ? { name, address: null, local: null, domain: null, asciiDomain: null } : null };
  }
  const addr = normalizeAddress(raw.address);
  if (!addr) return { error: `${field}.address must be a valid email address` };
  return { value: { name, ...addr } };
}

function parseAuthentication(raw) {
  const out = { spf: "unknown", dkim: "unknown", dmarc: "unknown" };
  if (raw === undefined || raw === null) return { value: out, supplied: false };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "emailContext.authentication must be an object" };
  let supplied = false;
  for (const key of AUTH_KEYS) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return { error: `emailContext.authentication.${key} must be a string` };
    const norm = v.trim().toLowerCase();
    out[key] = AUTH_RESULTS.includes(norm) ? norm : "unknown";
    if (out[key] !== "unknown") supplied = true;
  }
  return { value: out, supplied };
}

function parseAttachments(raw) {
  if (raw === undefined || raw === null) return { value: [] };
  if (!Array.isArray(raw)) return { error: "emailContext.attachments must be an array" };
  if (raw.length > MAX_ATTACHMENTS) return { error: `emailContext.attachments must have at most ${MAX_ATTACHMENTS} entries` };
  const out = [];
  for (const [i, a] of raw.entries()) {
    if (!a || typeof a !== "object" || Array.isArray(a)) return { error: `emailContext.attachments[${i}] must be an object` };
    if (typeof a.name !== "string" || a.name.trim() === "" || a.name.length > 255) {
      return { error: `emailContext.attachments[${i}].name must be a non-empty string of at most 255 characters` };
    }
    if (a.contentType !== undefined && a.contentType !== null && (typeof a.contentType !== "string" || a.contentType.length > 200)) {
      return { error: `emailContext.attachments[${i}].contentType must be a string` };
    }
    if (a.size !== undefined && a.size !== null && (typeof a.size !== "number" || !Number.isFinite(a.size) || a.size < 0)) {
      return { error: `emailContext.attachments[${i}].size must be a non-negative number` };
    }
    out.push({ name: a.name.normalize("NFKC").trim(), contentType: a.contentType?.trim().toLowerCase() || null, size: a.size ?? null });
  }
  return { value: out };
}

function parseStringList(raw, field, max, maxLen) {
  if (raw === undefined || raw === null) return { value: [] };
  if (!Array.isArray(raw)) return { error: `${field} must be an array of strings` };
  if (raw.length > max) return { error: `${field} must have at most ${max} entries` };
  if (!raw.every((s) => typeof s === "string" && s.length <= maxLen)) return { error: `${field} must contain strings of at most ${maxLen} characters` };
  return { value: raw.map((s) => s.trim()).filter(Boolean) };
}

// "Name <addr>" / { name, address } / "addr" -> { name, ...address } | null
function parseSenderEntry(entry) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const addr = normalizeAddress(entry.address);
    return addr ? { name: cleanName(entry.name), ...addr } : null;
  }
  if (typeof entry !== "string" || entry.length > MAX_ADDRESS + MAX_NAME) return null;
  const m = /^(.*)<([^<>]+)>\s*$/.exec(entry.trim());
  const addr = normalizeAddress(m ? m[2] : entry);
  return addr ? { name: m ? cleanName(m[1]) : null, ...addr } : null;
}

function parseThreadContext(raw) {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "emailContext.threadContext must be an object" };
  const list = raw.previousSenders ?? [];
  if (!Array.isArray(list) || list.length > MAX_PREVIOUS_SENDERS) {
    return { error: `emailContext.threadContext.previousSenders must be an array of at most ${MAX_PREVIOUS_SENDERS} entries` };
  }
  const previousSenders = [];
  for (const s of list) {
    const addr = parseSenderEntry(s);
    if (!addr) return { error: "emailContext.threadContext.previousSenders must contain valid email addresses" };
    previousSenders.push(addr);
  }
  // An empty history is "no history" - EMAIL-04 needs at least one sender.
  return { value: previousSenders.length ? { previousSenders } : null };
}

// Optional client-side history for this sender in this mailbox (Outlook can
// compute it). Absent => no first-seen evidence at all, never "new sender".
function parseSenderContext(raw) {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "emailContext.senderContext must be an object" };
  const out = {};
  if (raw.firstSeenAt !== undefined && raw.firstSeenAt !== null) {
    if (typeof raw.firstSeenAt !== "string" || !Number.isFinite(Date.parse(raw.firstSeenAt))) return { error: "emailContext.senderContext.firstSeenAt must be an ISO date string" };
    out.firstSeenAt = new Date(Date.parse(raw.firstSeenAt)).toISOString();
  }
  if (raw.previousMessageCount !== undefined && raw.previousMessageCount !== null) {
    if (!Number.isSafeInteger(raw.previousMessageCount) || raw.previousMessageCount < 0) return { error: "emailContext.senderContext.previousMessageCount must be a non-negative integer" };
    out.previousMessageCount = raw.previousMessageCount;
  }
  return { value: Object.keys(out).length ? out : null };
}

/**
 * Validates the optional `emailContext` request field.
 * @returns {{ value: object|null } | { error: string }}
 */
export function validateEmailContext(raw) {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "emailContext must be an object" };

  if (raw.messageId !== undefined && raw.messageId !== null && (typeof raw.messageId !== "string" || raw.messageId.length > MAX_MESSAGE_ID)) {
    return { error: `emailContext.messageId must be a string of at most ${MAX_MESSAGE_ID} characters` };
  }
  if (raw.subject !== undefined && raw.subject !== null && (typeof raw.subject !== "string" || raw.subject.length > MAX_SUBJECT)) {
    return { error: `emailContext.subject must be a string of at most ${MAX_SUBJECT} characters` };
  }

  const from = parseMailbox(raw.from, "emailContext.from");
  if (from.error) return from;

  let replyToRaw = raw.replyTo;
  if (replyToRaw !== undefined && replyToRaw !== null && !Array.isArray(replyToRaw)) replyToRaw = [replyToRaw];
  if (Array.isArray(replyToRaw) && replyToRaw.length > MAX_REPLY_TO) return { error: `emailContext.replyTo must have at most ${MAX_REPLY_TO} entries` };
  const replyTo = [];
  for (const [i, r] of (replyToRaw ?? []).entries()) {
    const parsed = parseMailbox(r, `emailContext.replyTo[${i}]`);
    if (parsed.error) return parsed;
    if (parsed.value?.address) replyTo.push(parsed.value);
  }

  let returnPath = null;
  if (raw.returnPath !== undefined && raw.returnPath !== null && raw.returnPath !== "") {
    returnPath = normalizeAddress(raw.returnPath);
    if (!returnPath) return { error: "emailContext.returnPath must be a valid email address" };
  }

  const auth = parseAuthentication(raw.authentication);
  if (auth.error) return auth;
  const attachments = parseAttachments(raw.attachments);
  if (attachments.error) return attachments;
  const urls = parseStringList(raw.urls, "emailContext.urls", MAX_URLS, MAX_URL);
  if (urls.error) return urls;
  const threadContext = parseThreadContext(raw.threadContext);
  if (threadContext.error) return threadContext;
  const senderContext = parseSenderContext(raw.senderContext);
  if (senderContext.error) return senderContext;
  // The mailbox owner, used only (hashed) to tell a company-wide campaign
  // from one person receiving the same email twice.
  let recipient = null;
  if (raw.recipient !== undefined && raw.recipient !== null && raw.recipient !== "") {
    recipient = normalizeAddress(raw.recipient);
    if (!recipient) return { error: "emailContext.recipient must be a valid email address" };
  }

  return {
    value: {
      messageId: raw.messageId?.trim() || null,
      from: from.value,
      replyTo,
      returnPath,
      subject: raw.subject?.normalize("NFKC").trim() || null,
      authentication: auth.value,
      authenticationSupplied: auth.supplied,
      attachments: attachments.value,
      urls: urls.value,
      threadContext: threadContext.value,
      senderContext: senderContext.value,
      recipient,
    },
  };
}

/**
 * Which kinds of evidence the client actually supplied - reported back in
 * analysis.email so the UI can say "not enough evidence" instead of implying
 * a check passed.
 */
export function availableEvidence(ctx) {
  if (!ctx) return [];
  const out = [];
  if (ctx.from?.address) out.push("from");
  if (ctx.from?.name) out.push("displayName");
  if (ctx.replyTo.length) out.push("replyTo");
  if (ctx.returnPath) out.push("returnPath");
  if (ctx.subject) out.push("subject");
  if (ctx.authenticationSupplied) out.push("authentication");
  if (ctx.attachments.length) out.push("attachments");
  if (ctx.urls.length) out.push("urls");
  if (ctx.threadContext) out.push("threadContext");
  if (ctx.senderContext) out.push("senderContext");
  if (ctx.recipient) out.push("recipient");
  return out;
}
