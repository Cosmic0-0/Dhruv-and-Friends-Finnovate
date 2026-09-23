/**
 * Server-side port of frontend/lib/redact.ts, for the one path where
 * redaction can't happen client-side: screenshot ingestion. The raw image
 * has to reach the server for OCR, so there's no way to redact before the
 * text exists - this runs on the OCR-extracted text, before it's handed to
 * runPipeline(), so the LLM (and the client, in the response) never sees
 * the raw identifiers, matching the guarantee the text-paste flow makes by
 * redacting in the browser before send.
 *
 * Keep this in sync with frontend/lib/redact.ts by hand - the two packages
 * don't share code (see CLAUDE.md: backend/ and frontend/ are separate Node
 * projects). Logic is identical; only the TypeScript types were dropped.
 *
 * Removed:
 *   - account / card numbers (6+ digits, or IBAN-style): last 4 kept, e.g.
 *     "[account ending 4417]"
 *   - phone numbers: +230 / 00230 international, and local 7-8 digit numbers
 *   - email addresses: the local part only ("[email 1]@mcb-alerts.com")
 *
 * Deliberately KEPT, because scam detection depends on them:
 *   - URLs and domains (incl. the domain of an email address): lookalike
 *     matching needs them verbatim
 *   - OTP-style 4-8 digit codes near words like "OTP", "code", "PIN", "kod"
 *   - currency amounts ("Rs 5,000", "MUR 12 500", "€100", "1,250.00")
 *
 * NOT removed: personal names. Regex can't find names reliably across
 * English, French and Kreol.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,24})\b/g;

// Explicit URLs, then bare domains like "mcb-secure.mu/verify" or "bit.ly/x".
const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}\b(?:\/[^\s<>"']*)?/g;

// An amount: either thousands-grouped (1,250 / 12 500 / 1.250) or plain, with optional decimals.
// (?!\d) stops space-grouping from swallowing the start of a following number.
const AMOUNT = String.raw`(?:\d{1,3}(?:[ ,. ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d])`;
const CURRENCY_WORD = String.raw`(?:Rs\.?|MUR|EUR|USD|GBP|roupies?|rupees?|rupi)`;
const CURRENCY_RE = new RegExp(
  [
    String.raw`(?<![A-Za-z])${CURRENCY_WORD}\s?${AMOUNT}`,
    String.raw`[€$£]\s?${AMOUNT}`,
    String.raw`(?<![\w.,])${AMOUNT}\s?(?:${CURRENCY_WORD}|[€$£])(?![A-Za-z])`,
    // Comma-grouped or two-decimal numbers read as amounts even without a currency marker.
    String.raw`(?<![\d])\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?(?![\d])`,
    String.raw`(?<![\d.,])\d+[.,]\d{2}(?![\d])`,
  ].join("|"),
  "gi",
);

// Dates like 22/09/2026 or 22-09-26: not identifiers, and must not be read as phones.
const DATE_RE = /(?<![\d])\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?![\d])/g;

// IBAN-style account identifiers (e.g. MU17 BOMM 0101 1010 3030 0200 000M UR).
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g;

// Mauritius international format: +230 / 00230, then a 7- or 8-digit number.
const INTL_PHONE_RE = /\(?(?:\+|00)230\)?[\s.-]?\d(?:[\s.-]?\d){6,7}(?![\d])/g;

// Digit runs, allowing single spaces/dashes between groups ("5251 2345", "1234-5678-9012").
// Not adjacent to letters, so already-masked "XXXX4417" or "ABC123456" are left alone.
const DIGIT_RUN_RE = /(?<![\w])\d+(?:[ -]\d+)*(?![\w])/g;

const OTP_CONTEXT =
  /\b(?:otp|code|codes|kod|pin|passcode|password|mot de passe|verification|vérification|verifikasion|token|cvv|secret)\b/gi;
const ACCOUNT_CONTEXT =
  /(?:\b(?:account|acct|acc|compte|kont|card|carte|kart|iban|numero|numéro|nimero|ending)\b|a\/c)/gi;

const PHONE_CONTEXT =
  /\b(?:call|calls|phone|tel|téléphone|telephone|telefonn|mobile|appelez|appeler|apel|whatsapp|contact|contactez|kontak)\b/gi;

const CONTEXT_WINDOW = 32;

/** Distance (in chars) from the number to the nearest keyword match within the window, or Infinity. */
function nearestKeyword(text, start, end, re) {
  let best = Infinity;
  const before = text.slice(Math.max(0, start - CONTEXT_WINDOW), start);
  for (const m of before.matchAll(re)) best = Math.min(best, before.length - (m.index + m[0].length));
  const after = text.slice(end, end + CONTEXT_WINDOW);
  for (const m of after.matchAll(re)) best = Math.min(best, m.index);
  return best;
}

function overlaps(spans, start, end) {
  return spans.some((s) => start < s.end && end > s.start);
}

function collect(text, re, spans, kind) {
  for (const m of text.matchAll(re)) {
    const start = m.index;
    const end = start + m[0].length;
    if (!overlaps(spans, start, end)) spans.push({ start, end, kind });
  }
}

function classifyDigitRun(text, start, end) {
  const digits = text.slice(start, end).replace(/\D/g, "");
  const n = digits.length;
  if (n < 6) return null; // too short to be an account (6+) or a phone (7-8)
  if (n >= 9) return "account"; // longer than any OTP or local phone

  // The nearest keyword decides: "call 52512345 to get your code" is a phone,
  // "your OTP is 52512345" is a code.
  const otp = nearestKeyword(text, start, end, OTP_CONTEXT);
  const account = nearestKeyword(text, start, end, ACCOUNT_CONTEXT);
  const phone = nearestKeyword(text, start, end, PHONE_CONTEXT);
  const nearest = Math.min(otp, account, phone);
  if (nearest < Infinity) {
    if (account === nearest) return "account";
    if (otp === nearest) return null; // OTP-style code: keep, it's a scam signal
    return n === 7 || n === 8 ? "phone" : null;
  }
  if (n === 7 || n === 8) return "phone";
  return null; // bare 6-digit number with no context: most likely a code, keep
}

/** Last 4 digits of an identifier, or its last 4 characters if it has fewer digits. */
function lastFour(original) {
  const digits = original.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : original.replace(/\s/g, "").slice(-4);
}

/**
 * @param {string} text
 * @returns {{ redacted: string, redactions: Array<{ kind: "account"|"phone"|"email", placeholder: string, original: string }> }}
 */
export function redact(text) {
  const spans = [];

  // Order matters: earlier passes claim their spans so later ones skip them.
  collect(text, EMAIL_RE, spans, "email");
  collect(text, URL_RE, spans); // protected
  collect(text, CURRENCY_RE, spans); // protected
  collect(text, DATE_RE, spans); // protected
  for (const m of text.matchAll(IBAN_RE)) {
    // Require real account-number density so all-caps words like "AB12 ALERT…" don't match.
    if (m[0].replace(/\D/g, "").length < 8) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (!overlaps(spans, start, end)) spans.push({ start, end, kind: "account" });
  }
  collect(text, INTL_PHONE_RE, spans, "phone");
  for (const m of text.matchAll(DIGIT_RUN_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    if (overlaps(spans, start, end)) continue;
    const kind = classifyDigitRun(text, start, end);
    if (kind) spans.push({ start, end, kind });
  }

  spans.sort((a, b) => a.start - b.start);

  const byOriginal = new Map();
  const redactions = [];
  const counters = { account: 0, phone: 0, email: 0 };
  const usedPlaceholders = new Set();

  const placeholderFor = (kind, original) => {
    const existing = byOriginal.get(original);
    if (existing) return existing.placeholder;
    counters[kind]++;
    let placeholder;
    if (kind === "email") {
      const domain = original.slice(original.lastIndexOf("@") + 1);
      placeholder = `[email ${counters.email}]@${domain}`;
    } else if (kind === "phone") {
      placeholder = `[phone ${counters.phone}]`;
    } else {
      const tail = lastFour(original);
      placeholder = `[account ending ${tail}]`;
      if (usedPlaceholders.has(placeholder)) placeholder = `[account ${counters.account} ending ${tail}]`;
    }
    usedPlaceholders.add(placeholder);
    const r = { kind, placeholder, original };
    byOriginal.set(original, r);
    redactions.push(r);
    return placeholder;
  };

  let out = "";
  let cursor = 0;
  for (const span of spans) {
    if (!span.kind) continue;
    out += text.slice(cursor, span.start);
    out += placeholderFor(span.kind, text.slice(span.start, span.end));
    cursor = span.end;
  }
  out += text.slice(cursor);

  return { redacted: out, redactions };
}
