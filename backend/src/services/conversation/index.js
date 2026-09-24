// Whole-conversation analysis (POST /api/analyze/conversation).
//
// A chat is analysed as ONE message through the shared pipeline: the other
// party's messages, in order, joined into one transcript. That keeps every
// guarantee of runPipeline() - deterministic verdict and score, grounded
// semantic evidence, the intervention policy - and records community / ScamDNA
// evidence once per conversation rather than once per bubble.
//
// Everything conversation-specific here is deterministic and derived from
// that single result:
//   - flags: each signal whose evidence quote sits inside one of the other
//     party's messages is attached to that message (by span, else by
//     grounding the quote). No evidence, no flag.
//   - stages: the first message at which a signal implying a playbook stage
//     appears (fixed CODE_STAGE table below, stages from services/playbooks).
// The user's own messages are shown by the client but never analysed or
// flagged: the verdict is about what the other person sent.

import { normalizeText, locateEvidence } from "../normalize/index.js";
import { SCAM_STAGES } from "../playbooks/index.js";
import { SIGNAL_DEFS } from "../signals/registry.js";

export const MAX_CONVERSATION_MESSAGES = 500;
export const MAX_CONVERSATION_MESSAGE_LENGTH = 5000;
// How much of the other party's text one analysis covers. Longer chats keep
// their most recent messages (where a scam's ask usually is) and the response
// says where analysis started (conversation.firstAnalysedIndex).
export const MAX_CONVERSATION_TEXT = 12000;
const SEPARATOR = "\n\n";

// Which playbook stage a signal code implies. Fixed and deliberately small:
// only codes whose meaning maps onto one stage unambiguously.
export const CODE_STAGE = Object.freeze({
  "ID-01": "AUTHORITY_CLAIM",
  "ID-02": "AUTHORITY_CLAIM",
  "ID-03": "AUTHORITY_CLAIM",
  "ID-04": "AUTHORITY_CLAIM",
  "SOC-01": "URGENCY",
  "SOC-02": "URGENCY",
  "SOC-05": "INITIAL_CONTACT",
  "SOC-06": "TRUST_BUILDING",
  "SEC-01": "OTP_REQUEST",
  "SEC-02": "CREDENTIAL_REQUEST",
  "SEC-03": "CREDENTIAL_REQUEST",
  "PAY-01": "PAYMENT_REQUEST",
  "PAY-02": "PAYMENT_REQUEST",
  "PAY-03": "PAYMENT_REQUEST",
  "PAY-04": "PAYMENT_REQUEST",
  "PAY-05": "PAYMENT_REQUEST",
  "PAY-07": "PAYMENT_REQUEST",
  "PAY-06": "PAYMENT_PRESSURE",
});

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };

/**
 * @param {unknown} body request body
 * @returns {{ error: string } | { value: { messages: { from: "me"|"them", text: string }[], language?: string } }}
 */
export function validateConversation(body) {
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return { error: "messages must be a non-empty array" };
  if (messages.length > MAX_CONVERSATION_MESSAGES) {
    return { error: `messages exceeds the maximum of ${MAX_CONVERSATION_MESSAGES}` };
  }
  const clean = [];
  for (const m of messages) {
    if (typeof m !== "object" || m === null) return { error: "every message must be an object" };
    if (m.from !== "me" && m.from !== "them") return { error: 'every message needs from: "me" or "them"' };
    if (typeof m.text !== "string" || m.text.trim() === "") return { error: "every message needs non-empty text" };
    if (m.text.length > MAX_CONVERSATION_MESSAGE_LENGTH) {
      return { error: `every message must be ${MAX_CONVERSATION_MESSAGE_LENGTH} characters or fewer` };
    }
    clean.push({ from: m.from, text: m.text });
  }
  if (!clean.some((m) => m.from === "them")) return { error: "the conversation has no messages from the other person" };
  const language = typeof body.language === "string" && body.language.length <= 16 ? body.language : undefined;
  return { value: { messages: clean, ...(language ? { language } : {}) } };
}

/**
 * The other party's messages joined in order, newest kept first when over
 * MAX_CONVERSATION_TEXT. `parts` maps transcript offsets back to message
 * indexes (in the request's numbering).
 */
export function buildTranscript(messages) {
  const theirs = [];
  messages.forEach((m, index) => {
    if (m.from !== "them") return;
    const text = normalizeText(m.text);
    if (text) theirs.push({ index, text });
  });

  const kept = [];
  let length = 0;
  for (let i = theirs.length - 1; i >= 0; i--) {
    const add = theirs[i].text.length + (kept.length ? SEPARATOR.length : 0);
    if (kept.length && length + add > MAX_CONVERSATION_TEXT) break;
    kept.unshift(theirs[i]);
    length += add;
  }
  // A single message longer than the budget is cut to the budget.
  if (kept.length === 1 && kept[0].text.length > MAX_CONVERSATION_TEXT) {
    kept[0] = { ...kept[0], text: kept[0].text.slice(-MAX_CONVERSATION_TEXT) };
  }

  let text = "";
  const parts = kept.map((m) => {
    if (text) text += SEPARATOR;
    const start = text.length;
    text += m.text;
    return { index: m.index, start, end: text.length };
  });
  return {
    text,
    parts,
    theirCount: theirs.length,
    truncated: kept.length < theirs.length || (theirs.length === 1 && theirs[0].text.length > MAX_CONVERSATION_TEXT),
    firstAnalysedIndex: parts[0]?.index ?? null,
  };
}

function partAt(parts, offset) {
  return parts.find((p) => offset >= p.start && offset < p.end) ?? null;
}

/**
 * Attaches each evidence-bearing signal to the message its quote came from.
 * @returns {{ index: number, code: string, severity: string, label: string, evidence: string }[]}
 */
export function mapFlags(signals, transcript) {
  const flags = [];
  const seen = new Set();
  for (const s of signals ?? []) {
    if (!s || typeof s.code !== "string" || typeof s.evidence !== "string" || !s.evidence) continue;
    if (s.sourceType === "community") continue; // about the sender/pattern, not a quote
    let start = null;
    if (Array.isArray(s.span) && Number.isInteger(s.span[0])) start = s.span[0];
    else {
      const found = locateEvidence(transcript.text, s.evidence);
      if (found) start = found.span[0];
    }
    if (start === null) continue;
    const part = partAt(transcript.parts, start);
    if (!part) continue;
    const key = `${part.index}:${s.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    flags.push({
      index: part.index,
      code: s.code,
      severity: SEVERITY_RANK[s.severity] ? s.severity : "medium",
      label: SIGNAL_DEFS[s.code]?.label ?? s.description ?? s.code,
      evidence: s.evidence,
    });
  }
  return flags.sort((a, b) => a.index - b.index || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

/** First message at which each playbook stage appears, in conversation order. */
export function stageTimeline(flags) {
  const first = new Map();
  for (const f of flags) {
    const stage = CODE_STAGE[f.code];
    if (!stage || !SCAM_STAGES.includes(stage)) continue;
    if (!first.has(stage) || f.index < first.get(stage)) first.set(stage, f.index);
  }
  return [...first.entries()]
    .map(([stage, index]) => ({ stage, index }))
    .sort((a, b) => a.index - b.index || SCAM_STAGES.indexOf(a.stage) - SCAM_STAGES.indexOf(b.stage));
}

/**
 * @param {{ from: "me"|"them", text: string }[]} messages already validated (and redacted by the client)
 * @param {{ analyze: (text: string) => Promise<object> }} deps runPipeline, bound to the request context
 */
export async function analyzeConversation(messages, { analyze }) {
  const transcript = buildTranscript(messages);
  const result = await analyze(transcript.text);
  const flags = mapFlags(result.signals, transcript);
  return {
    ...result,
    conversation: {
      messageCount: messages.length,
      theirMessageCount: transcript.theirCount,
      analysedMessageCount: transcript.parts.length,
      truncated: transcript.truncated,
      firstAnalysedIndex: transcript.firstAnalysedIndex,
      flags,
      stages: stageTimeline(flags),
    },
  };
}
