// The channel a message arrived by, as reported by the user ("Received by"
// on the web Check screen). It is context, never evidence: the user picks it,
// so it can be wrong, and it never adds a signal or changes the score. The
// semantic model sees it as a hint (a "wrong number" opener reads differently
// on WhatsApp than in an email), and the response echoes it back in
// analysis.channel so the result can say what was checked.

export const CHANNELS = Object.freeze(["sms", "whatsapp", "email", "facebook", "call"]);

const LABELS = Object.freeze({ sms: "SMS", whatsapp: "WhatsApp", email: "Email", facebook: "Facebook / Messenger", call: "Phone call (the user's notes or transcript)" });

/** undefined/null → { value: null }; a known id → { value }; anything else → { error }. */
export function validateChannel(value) {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== "string" || !CHANNELS.includes(value)) {
    return { error: `channel must be one of: ${CHANNELS.join(", ")}` };
  }
  return { value };
}

/** Prompt-safe label for a validated channel id. */
export function channelLabel(channel) {
  return LABELS[channel] ?? null;
}
