/**
 * Landing page -> /app hand-off for a message typed on the landing hero.
 *
 * The text goes through sessionStorage, never the URL: a message can carry
 * account numbers or codes, and a query string ends up in history, logs and
 * referrers. The entry is read once and removed.
 */
const KEY = "fraudlens.pendingCheck.v1";
const MAX_AGE_MS = 5 * 60 * 1000;

export function savePendingCheck(text: string): boolean {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ text, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Returns the pending text (at most once), or null when there is none or it is stale. */
export function takePendingCheck(now: number = Date.now()): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { text, at } = parsed as { text?: unknown; at?: unknown };
    if (typeof text !== "string" || !text.trim()) return null;
    if (typeof at !== "number" || now - at > MAX_AGE_MS) return null;
    return text;
  } catch {
    return null;
  }
}
