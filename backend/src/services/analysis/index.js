import { callLLM } from "./llmClient.js";

const VERDICTS = ["safe", "suspicious", "scam"];
const SEVERITIES = ["low", "medium", "high"];

const SYSTEM_PROMPT = `You are a fraud detection assistant for Mauritius. Analyze the message for scam signals (bank impersonation, urgency language, spoofed identity, mobile money fraud, telecom prize scams). Respond with ONLY valid JSON matching this schema:
{"verdict": "safe"|"suspicious"|"scam", "signals": [{"type": string, "description": string, "severity": "low"|"medium"|"high"}], "suggestedAction": string, "explanation": string}
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

export async function analyzeMessage(message, language) {
  const prompt = `${SYSTEM_PROMPT}\n\nLanguage hint: ${language || "unspecified"}\nMessage: ${message}`;
  const { text } = await callLLM(prompt);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("LLM returned invalid JSON");
  }
  if (!validate(parsed)) throw new Error("LLM output failed schema validation");
  return parsed;
}
