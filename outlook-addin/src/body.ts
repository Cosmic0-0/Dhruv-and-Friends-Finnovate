import { LIMITS } from "./contract";

const MAX_BODY_CHARS = 4_800;
const MIN_CURRENT_MESSAGE_CHARS = 160;

const QUOTED_THREAD_MARKERS = [
  /\n-{2,}\s*original message\s*-{2,}/i,
  /\nOn .{1,160} wrote:\s*$/im,
  /\nFrom:\s*[^\n]+\nSent:\s*[^\n]+\n(?:To|Subject):/i,
  /\nDe\s*:\s*[^\n]+\nEnvoy[ée]\s*:\s*[^\n]+\n(?:À|Objet)\s*:/i,
];

// Containers Outlook, Gmail and Apple Mail wrap around quoted history. They
// are structural equivalents of the text markers above.
const QUOTE_CONTAINER = "blockquote, #divRplyFwdMsg, #appendonsend, .gmail_quote, [id^='mail-editor-reference-message-container']";

const BLOCK_TAGS = new Set(["ADDRESS", "ARTICLE", "BLOCKQUOTE", "BR", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "LI", "OL", "P", "PRE", "SECTION", "TABLE", "TR", "UL"]);
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

function normalizeBody(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Earliest quoted-history marker that follows enough current-message text, or -1. */
function quoteCutIndex(text: string): number {
  let cutAt = -1;
  for (const marker of QUOTED_THREAD_MARKERS) {
    const match = marker.exec(text);
    if (match && match.index >= MIN_CURRENT_MESSAGE_CHARS && (cutAt < 0 || match.index < cutAt)) cutAt = match.index;
  }
  return cutAt;
}

export function htmlToText(html: string): string {
  const documentValue = new DOMParser().parseFromString(html, "text/html");
  for (const node of documentValue.querySelectorAll("script, style, noscript, template")) node.remove();
  return normalizeBody(documentValue.body.textContent ?? "");
}

interface LinearisedHtml {
  text: string;
  anchors: Array<{ href: string; offset: number }>;
  /** Text length where a structural quote container begins, or -1. */
  containerCut: number;
}

/**
 * Document-order text with single line breaks at block boundaries, remembering
 * the text offset of every anchor. Offsets stay exact because the text is
 * built once and never rewritten afterwards.
 */
function linearise(html: string): LinearisedHtml {
  const documentValue = new DOMParser().parseFromString(html, "text/html");
  const containers = new Set(documentValue.querySelectorAll(QUOTE_CONTAINER));
  let text = "";
  let containerCut = -1;
  const anchors: LinearisedHtml["anchors"] = [];

  const lineBreak = (): void => {
    if (text.length > 0 && !text.endsWith("\n")) text += "\n";
  };
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      text += (node.nodeValue ?? "").replace(/\s+/g, " ");
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (SKIPPED_TAGS.has(element.tagName)) return;
    if (containerCut < 0 && containers.has(element) && text.length >= MIN_CURRENT_MESSAGE_CHARS) containerCut = text.length;
    const block = BLOCK_TAGS.has(element.tagName);
    if (block) lineBreak();
    if (element.tagName === "A") {
      const href = element.getAttribute("href")?.trim();
      if (href) anchors.push({ href, offset: text.length });
    }
    for (const child of element.childNodes) visit(child);
    if (block) lineBreak();
  };
  visit(documentValue.body);
  return { text, anchors, containerCut };
}

/**
 * HTTP(S) link targets from the current message only: anchors that sit after
 * the point where quoted history is cut from the analysed text are ignored,
 * so URL evidence always matches the message text FraudLens sees. Links longer
 * than the API accepts lose their query and fragment (the host and path, which
 * the backend's domain checks use, are kept; counted in `shortened`); if still
 * too long, or beyond the count limit, they are counted in `omitted`. Neither
 * fails the request. Order is document order.
 */
export function extractCurrentMessageUrls(html: string): { urls: string[]; omitted: number; shortened: number } {
  const { text, anchors, containerCut } = linearise(html);
  const cuts = [quoteCutIndex(text), containerCut].filter((value) => value >= 0);
  const limit = cuts.length ? Math.min(...cuts) : Infinity;

  const urls = new Set<string>();
  let omitted = 0;
  let shortened = 0;
  for (const anchor of anchors) {
    if (anchor.offset >= limit) continue;
    let href: string;
    try {
      const url = new URL(anchor.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      href = url.href;
    } catch {
      // Relative, malformed, mailto and script URLs are not network targets
      // for the backend's domain checks, so they are omitted.
      continue;
    }
    let submitted = href;
    if (submitted.length > LIMITS.url) {
      const parsed = new URL(href);
      submitted = `${parsed.origin}${parsed.pathname}`;
      if (submitted.length > LIMITS.url) {
        omitted++;
        continue;
      }
      shortened++;
    }
    if (urls.has(submitted)) continue;
    if (urls.size >= LIMITS.urls) {
      omitted++;
      continue;
    }
    urls.add(submitted);
  }
  return { urls: [...urls], omitted, shortened };
}

export function prepareEmailBody(raw: string): { text: string; truncated: boolean; removedQuotedContent: boolean } {
  let text = normalizeBody(raw);
  const cutAt = quoteCutIndex(text);
  const removedQuotedContent = cutAt >= 0;
  if (removedQuotedContent) text = text.slice(0, cutAt).trim();
  const truncated = text.length > MAX_BODY_CHARS;
  if (truncated) text = text.slice(0, MAX_BODY_CHARS).trimEnd();
  return { text, truncated, removedQuotedContent };
}

export const BODY_LIMIT = MAX_BODY_CHARS;
