"use client";

import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import { ChevronRightIcon, DocumentIcon, LayersIcon, SearchIcon, BookIcon } from "./icons";

/**
 * Document check, Batch scan, Conversation and Sandbox in the Recent-list row style.
 *
 * The five-slot tab bar has no room for them, and the old tools grid that
 * linked them was removed with the rest of the desktop chrome — this card is
 * now their only entry point, so it is what keeps those three routes
 * reachable. It lives on Radar rather than Check, which the mockup keeps to
 * one task.
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
    <section className="sheet" aria-labelledby="tools-title">
      <div className="px-5 pt-4 pb-1">
        <h2 id="tools-title" className="micro text-ink-muted">
          {t.title}
        </h2>
      </div>
      <ul className="flex flex-col px-5 pb-1 [&>li+li]:border-t [&>li+li]:border-card-border">
        {rows.map(({ href, Icon, label, hint }) => (
          <li key={href}>
            <Link href={href} className="pressable flex min-h-[52px] items-center gap-3 py-3">
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted-surface text-ink">
                <Icon className="size-[17px]" strokeWidth={2} />
              </span>
              <span className="flex-1 text-[1.0625rem] text-ink">{label}</span>
              <span className="text-[0.9375rem] text-ink-muted">{hint}</span>
              <ChevronRightIcon className="size-[18px] shrink-0 text-icon-idle" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
