"use client";

import Link from "next/link";
import type { Copy } from "@/lib/i18n";
import { ChevronRightIcon, ShieldIcon } from "../icons";

/**
 * "About to pay someone?" — the SafePay entry point, a slim white row directly
 * under the hero.
 *
 * Deliberately not inside the hero: the hero keeps one primary and one
 * secondary action, so this stays one tap from launch without becoming a third
 * competing button under the main question.
 */
export default function PayRow({ copy }: { copy: Copy }) {
  return (
    <Link
      href="/safepay"
      className="card pressable flex min-h-[60px] items-center gap-3 py-0"
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted-surface text-ink">
        <ShieldIcon className="size-[18px]" strokeWidth={2} />
      </span>
      <span className="flex-1 text-[1.0625rem] font-medium text-ink">{copy.check.payRow}</span>
      <ChevronRightIcon className="size-[18px] shrink-0 text-icon-idle" />
    </Link>
  );
}
