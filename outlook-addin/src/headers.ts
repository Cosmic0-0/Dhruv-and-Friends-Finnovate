import type { AuthResult, MailboxAddress } from "./types";

const AUTH_RESULTS = new Set<AuthResult>(["pass", "fail", "softfail", "neutral", "none", "temperror", "permerror", "unknown"]);

function unfold(raw: string): string[] {
  return raw.replace(/\r\n?/g, "\n").replace(/\n[\t ]+/g, " ").split("\n");
}

function values(raw: string, name: string): string[] {
  const prefix = `${name.toLowerCase()}:`;
  return unfold(raw)
    .filter((line) => line.toLowerCase().startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim());
}

function authValue(text: string, key: "spf" | "dkim" | "dmarc"): AuthResult {
  const match = new RegExp(`\\b${key}\\s*=\\s*([a-z]+)`, "i").exec(text);
  const normalized = match?.[1]?.toLowerCase() as AuthResult | undefined;
  return normalized && AUTH_RESULTS.has(normalized) ? normalized : "unknown";
}

function splitAddresses(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angleDepth = 0;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "<") angleDepth++;
    if (!quoted && char === ">") angleDepth = Math.max(0, angleDepth - 1);
    if (char === "," && !quoted && angleDepth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseMailbox(value: string): MailboxAddress | null {
  const angle = /^(.*?)<([^<>\s]+@[^<>\s]+)>$/.exec(value.trim());
  const address = (angle?.[2] ?? value.trim()).replace(/^<|>$/g, "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(address)) return null;
  const rawName = angle?.[1]?.trim().replace(/^"|"$/g, "") || null;
  return { name: rawName, address: address.toLowerCase() };
}

export function parseInternetHeaders(raw: string): {
  authentication: { spf: AuthResult; dkim: AuthResult; dmarc: AuthResult };
  replyTo: MailboxAddress[];
  returnPath: string | null;
} {
  const authHeaders = values(raw, "Authentication-Results");
  const authText = authHeaders.join("; ");
  let spf = authValue(authText, "spf");
  if (spf === "unknown") {
    const receivedSpf = values(raw, "Received-SPF")[0] ?? "";
    const token = receivedSpf.split(/[\s;(]/)[0]?.toLowerCase() as AuthResult;
    if (AUTH_RESULTS.has(token)) spf = token;
  }

  const replyTo = values(raw, "Reply-To")
    .flatMap(splitAddresses)
    .map(parseMailbox)
    .filter((entry): entry is MailboxAddress => Boolean(entry))
    .slice(0, 10);
  const returnPath = parseMailbox(values(raw, "Return-Path")[0] ?? "")?.address ?? null;

  return {
    authentication: { spf, dkim: authValue(authText, "dkim"), dmarc: authValue(authText, "dmarc") },
    replyTo,
    returnPath,
  };
}
