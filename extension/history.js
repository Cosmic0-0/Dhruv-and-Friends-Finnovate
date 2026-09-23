// Rolling "recent checks" history in chrome.storage.local (14J).
//
// Privacy rule: only domain + timestamp + result summary are ever stored —
// never full page text, never selected text, never a message body. This
// mirrors the frontend's own recent-checks contract
// (frontend/lib/storage.ts stores REDACTED text only; the extension goes
// further and stores no text at all, since it has no redaction pipeline of
// its own to rely on).

const HISTORY_KEY = "fraudlens.recentChecks.v1";
const HISTORY_LIMIT = 15;

/**
 * @typedef {Object} HistoryEntry
 * @property {string} domain - hostname or short label, never a full message
 * @property {number} at - epoch ms
 * @property {"safe"|"suspicious"|"high-risk"|"unreachable"} state
 * @property {"auto"|"scan-page"|"selection"|"link"} kind - what triggered the check
 * @property {string} [summary] - one short human-readable line, no raw content
 */

/** @returns {Promise<HistoryEntry[]>} */
export async function getRecentChecks() {
  try {
    const { [HISTORY_KEY]: list } = await chrome.storage.local.get(HISTORY_KEY);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** @param {HistoryEntry} entry */
export async function addRecentCheck(entry) {
  try {
    const list = await getRecentChecks();
    const next = [entry, ...list].slice(0, HISTORY_LIMIT);
    await chrome.storage.local.set({ [HISTORY_KEY]: next });
  } catch {
    /* storage unavailable: nothing to persist, never blocks the check itself */
  }
}
