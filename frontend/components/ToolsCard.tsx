"use client";

import Link from "next/link";
import { card } from "./dc";
import type { Copy } from "@/lib/i18n";
import { ChevronRightIcon, DocumentIcon, LayersIcon, SearchIcon, BookIcon } from "./icons";

/**
 * Document check, Batch scan, Conversation and Sandbox: a compact row card,
 * dc-styled to match the rest of the (restyled) page it sits on. Not part of
 * Radar.dc.html, but kept — the five-slot tab bar has no room for these, and
 * this card is their only entry point.
 */
export default function ToolsCard({ copy }: { copy: Copy }) {
  const t = copy.tools;
  const rows = [
    { href: "/document", Icon: DocumentIcon, label: t.document, hint: t.documentHint },
    { href: "/batch", Icon: LayersIcon, label: t.batch, hint: t.batchHint },
    { href: "/conversation", Icon: SearchIcon, label: t.conversation, hint: t.conversationHint },
    { href: "/sandbox", Icon: BookIcon, label: t.sandbox, hint: t.sandboxHint },
  ];

  return (
    <section style={{ ...card(24), padding: "8px 20px" }} aria-labelledby="tools-title" data-fx>
      <h2 id="tools-title" style={{ margin: 0, padding: "12px 0 4px", fontSize: 12, letterSpacing: "0.04em", color: "var(--dc-text3)" }}>
        {t.title}
      </h2>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {rows.map(({ href, Icon, label, hint }, i) => (
          <li key={href} style={{ borderTop: i === 0 ? "none" : "1px solid var(--dc-line2)" }}>
            <Link href={href} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: "8px 0", textDecoration: "none", color: "inherit" }}>
              <span
                aria-hidden="true"
                style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--dc-hover)", color: "var(--dc-ink)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <Icon className="size-[15px]" strokeWidth={2} />
              </span>
              <span style={{ flex: 1, fontSize: 15, color: "var(--dc-ink)" }}>{label}</span>
              <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{hint}</span>
              <span style={{ display: "flex", color: "var(--dc-text3)", flexShrink: 0 }}>
                <ChevronRightIcon className="size-[16px]" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
