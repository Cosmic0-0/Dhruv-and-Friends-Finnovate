import { extractCurrentMessageUrls, htmlToText, prepareEmailBody } from "./body";
import { cleanAddress, cleanName, LIMITS } from "./contract";
import { parseInternetHeaders } from "./headers";
import type { AnalyzePayload, ExtractionReport, MailboxAddress } from "./types";

interface AsyncResult<T> { status: string; value: T; error?: { message?: string } }
interface BodyApi { getAsync(format: "text" | "html", callback: (result: AsyncResult<string>) => void): void }
interface MessageItem {
  itemType?: unknown;
  body: BodyApi;
  from?: { displayName?: string; emailAddress?: string };
  subject?: string;
  internetMessageId?: string;
  attachments?: Array<{ name: string; size?: number; contentType?: string; isInline?: boolean }>;
  getAllInternetHeadersAsync?: (callback: (result: AsyncResult<string>) => void) => void;
}

export interface OutlookBridge {
  item: MessageItem;
  recipient: string | null;
  headersSupported: boolean;
}

const succeeded = (status: string) => status.toLowerCase() === "succeeded";

function bodyValue(item: MessageItem, format: "text" | "html"): Promise<string> {
  return new Promise((resolve, reject) => {
    item.body.getAsync(format, (result) => {
      if (succeeded(result.status)) resolve(result.value ?? "");
      else reject(new Error(result.error?.message || `Outlook could not provide the ${format} body.`));
    });
  });
}

async function bodySnapshot(item: MessageItem): Promise<{ text: string; html: string; format: "text" | "html" }> {
  let html = "";
  let text = "";
  try {
    text = await bodyValue(item, "text");
  } catch {
    // HTML is the compatibility fallback below.
  }
  try {
    html = await bodyValue(item, "html");
  } catch {
    // Plain text is enough for analysis; hidden href extraction is simply
    // unavailable on clients that cannot provide HTML.
  }
  if (text.trim()) return { text, html, format: "text" };
  if (html.trim()) return { text: htmlToText(html), html, format: "html" };
  throw new Error("Outlook did not provide a readable message body.");
}

async function internetHeaders(item: MessageItem, supported: boolean): Promise<{ raw: string; available: boolean }> {
  if (!supported || typeof item.getAllInternetHeadersAsync !== "function") return { raw: "", available: false };
  return new Promise((resolve) => {
    item.getAllInternetHeadersAsync?.((result) => {
      resolve(succeeded(result.status) ? { raw: result.value ?? "", available: true } : { raw: "", available: false });
    });
  });
}

// An address the API would reject (e.g. an unresolved Exchange legacy DN) is
// sent as a display name only: unknown, not suspicious, and not a 400.
function sender(item: MessageItem): MailboxAddress | null {
  const address = cleanAddress(item.from?.emailAddress);
  const name = cleanName(item.from?.displayName);
  return address || name ? { name, address } : null;
}

function attachmentList(item: MessageItem): AnalyzePayload["emailContext"]["attachments"] {
  return (item.attachments ?? [])
    .filter((attachment) => !attachment.isInline && attachment.name?.trim())
    .slice(0, LIMITS.attachments)
    .map((attachment) => ({
      name: attachment.name.trim().slice(0, LIMITS.attachmentName),
      contentType: attachment.contentType?.toLowerCase().slice(0, LIMITS.contentType) || null,
      size: Number.isFinite(attachment.size) && attachment.size! >= 0 ? attachment.size! : null,
    }));
}

function defaultBridge(): OutlookBridge {
  const mailbox = Office.context.mailbox;
  return {
    item: mailbox.item as unknown as MessageItem,
    recipient: mailbox.userProfile?.emailAddress ?? null,
    headersSupported: Office.context.requirements.isSetSupported("Mailbox", "1.8"),
  };
}

/** Maps the selected read-mode Outlook message to the existing API contract. */
export async function buildAnalyzePayload(bridge: OutlookBridge = defaultBridge()): Promise<{ payload: AnalyzePayload; extraction: ExtractionReport }> {
  const { item } = bridge;
  if (!item?.body) throw new Error("Open an email in Outlook before running FraudLens.");

  const snapshot = await bodySnapshot(item);
  const prepared = prepareEmailBody(snapshot.text);
  if (!prepared.text) throw new Error("The current email has no readable body text.");

  const headerResult = await internetHeaders(item, bridge.headersSupported);
  const parsedHeaders = parseInternetHeaders(headerResult.raw);
  const { urls, omitted: urlsOmitted, shortened: urlsShortened } = snapshot.html ? extractCurrentMessageUrls(snapshot.html) : { urls: [], omitted: 0, shortened: 0 };
  const subject = item.subject?.trim().slice(0, LIMITS.subject) || null;
  const messageId = item.internetMessageId?.trim();
  const from = sender(item);

  return {
    payload: {
      source: "email",
      message: prepared.text,
      emailContext: {
        messageId: messageId && messageId.length <= LIMITS.messageId ? messageId : null,
        from,
        replyTo: parsedHeaders.replyTo,
        returnPath: parsedHeaders.returnPath,
        subject,
        authentication: parsedHeaders.authentication,
        attachments: attachmentList(item),
        urls,
        threadContext: null,
        recipient: cleanAddress(bridge.recipient),
        senderContext: null,
      },
    },
    extraction: {
      bodyFormat: snapshot.format,
      bodyTruncated: prepared.truncated,
      quotedContextRemoved: prepared.removedQuotedContent,
      headersAvailable: headerResult.available,
      urlsOmitted,
      urlsShortened,
      subject,
      fromAddress: from?.address ?? null,
      // Conversation/mailbox-wide sender history is never available from
      // this bounded ReadItem-only client (threadContext/senderContext are
      // always null, see types.ts) - listing it here would repeat the same
      // two lines on every single result, so it's left out rather than
      // shown as if it varied.
      unavailable: [...(!headerResult.available ? ["internet headers, Reply-To and Return-Path"] : [])],
    },
  };
}
