import { extractUrlsFromHtml, htmlToText, prepareEmailBody } from "./body";
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

/** Plain text preferred; HTML is converted to text only as a fallback. */
export async function getCurrentMessageBody(item?: MessageItem): Promise<{ text: string; format: "text" | "html" }> {
  const activeItem = item ?? (Office.context.mailbox.item as unknown as MessageItem);
  const snapshot = await bodySnapshot(activeItem);
  return { text: prepareEmailBody(snapshot.text).text, format: snapshot.format };
}

async function internetHeaders(item: MessageItem, supported: boolean): Promise<{ raw: string; available: boolean }> {
  if (!supported || typeof item.getAllInternetHeadersAsync !== "function") return { raw: "", available: false };
  return new Promise((resolve) => {
    item.getAllInternetHeadersAsync?.((result) => {
      resolve(succeeded(result.status) ? { raw: result.value ?? "", available: true } : { raw: "", available: false });
    });
  });
}

function sender(item: MessageItem): MailboxAddress | null {
  const address = item.from?.emailAddress?.trim();
  if (!address) return null;
  return { name: item.from?.displayName?.trim() || null, address: address.toLowerCase() };
}

function defaultBridge(): OutlookBridge {
  const mailbox = Office.context.mailbox;
  return {
    item: mailbox.item as unknown as MessageItem,
    recipient: mailbox.userProfile?.emailAddress?.trim().toLowerCase() || null,
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
  const urls = snapshot.html ? extractUrlsFromHtml(snapshot.html) : [];
  const attachments = (item.attachments ?? [])
    .filter((attachment) => !attachment.isInline)
    .slice(0, 25)
    .map((attachment) => ({
      name: attachment.name,
      contentType: attachment.contentType?.toLowerCase() || null,
      size: Number.isFinite(attachment.size) ? attachment.size! : null,
    }));

  return {
    payload: {
      source: "email",
      message: prepared.text,
      emailContext: {
        messageId: item.internetMessageId?.trim() || null,
        from: sender(item),
        replyTo: parsedHeaders.replyTo,
        returnPath: parsedHeaders.returnPath,
        subject: item.subject?.trim() || null,
        authentication: parsedHeaders.authentication,
        attachments,
        urls,
        threadContext: null,
        recipient: bridge.recipient,
        senderContext: null,
      },
    },
    extraction: {
      bodyFormat: snapshot.format,
      bodyTruncated: prepared.truncated,
      quotedContextRemoved: prepared.removedQuotedContent,
      headersAvailable: headerResult.available,
      unavailable: [
        ...(!headerResult.available ? ["internet headers, Reply-To and Return-Path"] : []),
        "conversation sender history",
        "mailbox-wide sender history",
      ],
    },
  };
}
