// Field limits and address grammar of the backend's emailContext validator
// (backend/src/services/email-context/index.js). The backend answers 400 for
// the whole request when one field is out of bounds, so the add-in trims or
// omits such fields up front: a tracking link or odd sender must degrade one
// piece of evidence, not the entire analysis. These are input bounds only;
// no detection logic lives here.
export const LIMITS = {
  name: 200,
  address: 254,
  subject: 500,
  messageId: 300,
  attachmentName: 255,
  contentType: 200,
  url: 2048,
  urls: 50,
  attachments: 25,
  replyTo: 10,
} as const;

const ADDRESS_RE = /^([^\s@<>(),;:"\\]+)@([^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+)$/u;

/** Returns a lower-cased address the backend will accept, or null. */
export function cleanAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^<|>$/g, "").normalize("NFKC");
  if (!trimmed || trimmed.length > LIMITS.address || !ADDRESS_RE.test(trimmed)) return null;
  return raw.trim().replace(/^<|>$/g, "").toLowerCase();
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/^["']+|["']+$/g, "").replace(/\s+/g, " ").trim();
  return name ? name.slice(0, LIMITS.name) : null;
}
