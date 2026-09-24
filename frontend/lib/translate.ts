/**
 * Helpers for POST /api/translate. The Check screen only ever sends the
 * redacted message, and swaps each redaction placeholder ("[phone 1]",
 * "[account ending 4417]") for an opaque "<PRIV_n>" token first: a model may
 * translate the words inside a bracketed placeholder, but it must keep an opaque
 * token exactly (the backend rejects an answer that drops or invents one).
 * The real value is restored here, for display only.
 *
 * Pure and dependency-free, so it is unit-testable (lib/translate.test.ts).
 */
import { restore, type Redaction } from "./redact.ts";

export interface TokenizedMessage {
  text: string;
  /** Each redaction with its placeholder replaced by the token that stands in for it. */
  tokens: Redaction[];
}

export function tokenizeRedactions(redacted: string, redactions: readonly Redaction[]): TokenizedMessage {
  let text = redacted;
  const tokens: Redaction[] = [];
  // Longest placeholder first, so "[account 2 ending 4417]" wins over any shorter overlap.
  const ordered = [...redactions].sort((a, b) => b.placeholder.length - a.placeholder.length);
  ordered.forEach((r, i) => {
    const token = `<PRIV_${i + 1}>`;
    text = text.split(r.placeholder).join(token);
    tokens.push({ ...r, placeholder: token });
  });
  return { text, tokens };
}

/** Puts the user's own values back into a translation, for display. */
export function restoreTokens(translated: string, tokens: readonly Redaction[]): string {
  return restore(translated, tokens);
}
