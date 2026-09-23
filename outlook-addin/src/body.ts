const MAX_BODY_CHARS = 4_800;
const MIN_CURRENT_MESSAGE_CHARS = 160;

const QUOTED_THREAD_MARKERS = [
  /\n-{2,}\s*original message\s*-{2,}/i,
  /\nOn .{1,160} wrote:\s*$/im,
  /\nFrom:\s*[^\n]+\nSent:\s*[^\n]+\n(?:To|Subject):/i,
  /\nDe\s*:\s*[^\n]+\nEnvoy[ée]\s*:\s*[^\n]+\n(?:À|Objet)\s*:/i,
];

function normalizeBody(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToText(html: string): string {
  const documentValue = new DOMParser().parseFromString(html, "text/html");
  for (const node of documentValue.querySelectorAll("script, style, noscript, template")) node.remove();
  return normalizeBody(documentValue.body.textContent ?? "");
}

export function extractUrlsFromHtml(html: string): string[] {
  const documentValue = new DOMParser().parseFromString(html, "text/html");
  const urls = new Set<string>();
  for (const anchor of documentValue.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const raw = anchor.getAttribute("href")?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if ((url.protocol === "http:" || url.protocol === "https:") && urls.size < 50) urls.add(url.href);
    } catch {
      // Relative, malformed, mailto and script URLs are not network targets
      // for the backend's domain checks, so they are omitted.
    }
  }
  return [...urls];
}

export function prepareEmailBody(raw: string): { text: string; truncated: boolean; removedQuotedContent: boolean } {
  let text = normalizeBody(raw);
  let cutAt = -1;
  for (const marker of QUOTED_THREAD_MARKERS) {
    const match = marker.exec(text);
    if (match && match.index >= MIN_CURRENT_MESSAGE_CHARS && (cutAt < 0 || match.index < cutAt)) cutAt = match.index;
  }
  const removedQuotedContent = cutAt >= 0;
  if (removedQuotedContent) text = text.slice(0, cutAt).trim();
  const truncated = text.length > MAX_BODY_CHARS;
  if (truncated) text = text.slice(0, MAX_BODY_CHARS).trimEnd();
  return { text, truncated, removedQuotedContent };
}

export const BODY_LIMIT = MAX_BODY_CHARS;
