import { callLLM } from "./llmClient.js";
import { getKreolGrounding } from "./kreolGrounding.js";

const VERDICTS = ["safe", "suspicious", "scam"];
const SEVERITIES = ["low", "medium", "high"];

const SYSTEM_PROMPT = `You are a fraud detection assistant for Mauritius. Analyze the message for scam signals (bank impersonation, urgency language, spoofed identity, mobile money fraud, telecom prize scams). Respond with ONLY valid JSON matching this schema:
{"verdict": "safe"|"suspicious"|"scam", "signals": [{"type": string, "description": string, "severity": "low"|"medium"|"high", "evidence": string}], "suggestedAction": string, "explanation": string, "riskScore": number, "sender": string|null}
- "evidence" on each signal is a short VERBATIM excerpt (exact text or URL) copied from the message that triggered that signal. Omit it if no specific excerpt applies.
- "riskScore" is an integer 0-100: your overall confidence this message is a scam (0 = certainly safe, 100 = certainly a scam).
- "sender" is the identity the message claims to be from (a phone number, short code, or name like "MCB" or "My.t" mentioned in or implied by the message), or null if none is apparent.
The explanation must be written in the same language as the input message (English, French, or Kreol, including code-switched text).`;

function validate(parsed) {
  return (
    parsed &&
    VERDICTS.includes(parsed.verdict) &&
    Array.isArray(parsed.signals) &&
    parsed.signals.every(
      (s) => typeof s.type === "string" && typeof s.description === "string" && SEVERITIES.includes(s.severity)
    ) &&
    typeof parsed.suggestedAction === "string" &&
    typeof parsed.explanation === "string"
  );
}

// Every signal the LLM returns is, mechanically, "LLM output" — but for
// evidence provenance we want to say something more useful to the frontend
// than "the LLM said so": whether the LLM is directly quoting a pattern in
// the message text (urgency phrasing, an OTP/credential ask, a secrecy
// instruction) versus applying its own scam-pattern reasoning (spoofed
// identity, sender/channel mismatch, general fraud pattern-matching). This
// is a plain keyword classification over the signal `type` string — kept
// deterministic and separate from the LLM call itself.
const MESSAGE_TEXT_TYPE_PATTERN = /urgen|otp|credential|password|pin\b|secrecy|secret|pressure|threat|deadline/i;

// Exported for unit testing (see index.test.js) — pure/deterministic, no
// LLM call involved.
export function classifySignalSource(type) {
  return MESSAGE_TEXT_TYPE_PATTERN.test(type) ? "message_text" : "llm_analysis";
}

export function sanitizeSignal(s) {
  const out = { type: s.type, description: s.description, severity: s.severity, source: classifySignalSource(s.type) };
  if (typeof s.evidence === "string" && s.evidence.trim() !== "") out.evidence = s.evidence;
  return out;
}

// riskScore/sender are LLM-supplied extras layered on top of the required
// schema above - malformed/missing extras must never fail the whole
// analysis (see validate()), they're just omitted so the frontend's
// OPTIONAL-FUTURE handling (frontend/lib/types.ts) falls back to its
// no-score/no-sender display.
export async function analyzeMessage(message, language) {
  // Best-effort Kreol/French/English grounding (see kreolGrounding.js):
  // synchronous, in-memory, and defensive on its own, so this can never
  // throw or block - it degrades to bare SYSTEM_PROMPT below when the
  // dataset is missing or nothing relevant is found for this message.
  const { promptBlock } = getKreolGrounding(message);
  const groundedPrompt = promptBlock ? `${SYSTEM_PROMPT}\n\n${promptBlock}` : SYSTEM_PROMPT;
  const prompt = `${groundedPrompt}\n\nLanguage hint: ${language || "unspecified"}\nMessage: ${message}`;
  const { text } = await callLLM(prompt);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("LLM returned invalid JSON");
  }
  if (!validate(parsed)) throw new Error("LLM output failed schema validation");

  const result = {
    verdict: parsed.verdict,
    signals: parsed.signals.map(sanitizeSignal),
    suggestedAction: parsed.suggestedAction,
    explanation: parsed.explanation,
  };
  if (
    typeof parsed.riskScore === "number" &&
    Number.isFinite(parsed.riskScore) &&
    parsed.riskScore >= 0 &&
    parsed.riskScore <= 100
  ) {
    result.riskScore = Math.round(parsed.riskScore);
  }
  if (typeof parsed.sender === "string" && parsed.sender.trim() !== "") {
    result.sender = parsed.sender.trim();
  }
  return result;
}
