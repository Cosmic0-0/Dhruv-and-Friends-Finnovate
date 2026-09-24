/**
 * Chat export parsers (client-side only — the export never leaves the
 * browser except as the redacted, per-message text sent to
 * /api/analyze/conversation).
 *
 * WhatsApp ".txt" ("Export chat > Without media"): both the Android
 * ("DD/MM/YY, HH:MM - Sender: text") and iOS ("[DD/MM/YY, HH:MM:SS] Sender:
 * text") line formats, multi-line messages (continuation lines that don't
 * start a new timestamp are appended to the previous message), and system
 * lines (no "Sender: " — group changes, encryption notices) which are kept
 * out of the message list.
 *
 * Messenger ("your_activity_across_facebook/messages/.../message_1.json"):
 * Meta's export mis-encodes non-ASCII text as UTF-8 bytes read as Latin-1;
 * `fixMojibake` reverses that where possible.
 *
 * Dates are assumed DD/MM/YY(YY) (Mauritius/most non-US exports); a 2-digit
 * year is read as 20YY.
 */

export interface ParsedMessage {
  sender: string;
  text: string;
  /** null when the export line had no parseable date/time. */
  at: Date | null;
}

export interface ParsedChat {
  format: "whatsapp" | "messenger";
  /** Messenger export title, or null (WhatsApp exports carry no chat title). */
  title: string | null;
  /** Distinct senders, in first-appearance order. */
  participants: string[];
  /** Real messages only (system/notice lines are dropped), chronological. */
  messages: ParsedMessage[];
}

const INVISIBLE = /[‎‏]/g;
const SPACE_FIX = /[  ]/g;

function fixMojibake(s: string): string {
  try {
    const fixed = decodeURIComponent(escape(s));
    // A successful round-trip should not introduce the U+FFFD replacement char.
    return fixed.includes("�") ? s : fixed;
  } catch {
    return s;
  }
}

function parseDateTime(datePart: string, timePart: string): Date | null {
  const dm = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!dm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]);
  let year = Number(dm[3]);
  if (year < 100) year += 2000;

  const tm = timePart.replace(SPACE_FIX, " ").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/i);
  let hour: number;
  let minute: number;
  let second = 0;
  if (tm) {
    hour = Number(tm[1]) % 12;
    minute = Number(tm[2]);
    second = Number(tm[3] ?? 0);
    if (/p/i.test(tm[4])) hour += 12;
  } else {
    const tm24 = timePart.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!tm24) return null;
    hour = Number(tm24[1]);
    minute = Number(tm24[2]);
    second = Number(tm24[3] ?? 0);
  }
  const d = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Android: "12/03/24, 14:05 - Sender: text" or "-" variants; iOS: "[12/03/24, 14:05:03] Sender: text". */
const ANDROID_RE = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*([^\-\n]+?)\s-\s(.*)$/;
const IOS_RE = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*([^\]\n]+)\]\s(.*)$/;

export function parseWhatsAppTxt(raw: string): ParsedChat | null {
  const lines = raw.replace(INVISIBLE, "").split(/\r\n|\r|\n/);
  const messages: ParsedMessage[] = [];
  const seen: string[] = [];
  let current: ParsedMessage | null = null;

  for (const line of lines) {
    const ios = line.match(IOS_RE);
    const android = !ios ? line.match(ANDROID_RE) : null;
    const m = ios ?? android;
    if (m) {
      const [, datePart, timePart, rest] = m;
      const at = parseDateTime(datePart, timePart);
      const split = rest.match(/^([^:]{1,60}?):\s(.*)$/);
      if (split) {
        const [, sender, text] = split;
        current = { sender: sender.trim(), text: text.trim(), at };
        messages.push(current);
        if (!seen.includes(current.sender)) seen.push(current.sender);
      } else {
        // System line (join/leave, encryption notice, …): not a message from anyone.
        current = null;
      }
      continue;
    }
    // Continuation of the previous message (multi-line text).
    if (current && line.trim()) current.text += `\n${line.trim()}`;
  }

  if (messages.length === 0) return null;
  return { format: "whatsapp", title: null, participants: seen, messages };
}

interface MessengerRawMessage {
  sender_name?: string;
  timestamp_ms?: number;
  content?: string;
}

interface MessengerJson {
  title?: string;
  participants?: { name: string }[];
  messages?: MessengerRawMessage[];
}

export function parseMessengerJson(raw: string): ParsedChat | null {
  let data: MessengerJson;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data.messages)) return null;

  const seen: string[] = [];
  const messages: ParsedMessage[] = data.messages
    .filter((m): m is MessengerRawMessage & { sender_name: string; content: string } =>
      typeof m.sender_name === "string" && typeof m.content === "string" && m.content.trim().length > 0,
    )
    .map((m) => {
      const sender = fixMojibake(m.sender_name);
      if (!seen.includes(sender)) seen.push(sender);
      return { sender, text: fixMojibake(m.content).trim(), at: m.timestamp_ms ? new Date(m.timestamp_ms) : null };
    })
    // Messenger exports newest-first.
    .reverse();

  if (messages.length === 0) return null;
  return { format: "messenger", title: data.title ? fixMojibake(data.title) : null, participants: seen, messages };
}

export function parseChatExport(fileName: string, raw: string): ParsedChat | null {
  const trimmed = raw.trimStart();
  if (fileName.toLowerCase().endsWith(".json") || trimmed.startsWith("{")) return parseMessengerJson(raw);
  return parseWhatsAppTxt(raw);
}
