"use client";

import type { Copy } from "@/lib/i18n";
import { useParallax } from "@/lib/useParallax";
import { ClipboardIcon, ImageIcon } from "../icons";

/**
 * The dark hero on the Check screen (frontend/design/mockup/Main.html):
 * greeting, "Is this a scam?", one line, then the primary "Paste & check"
 * button and the screenshot button beside it.
 *
 * The buttons are white-on-hero in BOTH schemes, as drawn — the hero is a dark
 * card in dark mode too, so they do not invert.
 */
export default function CheckHero({
  copy,
  onPaste,
  onScreenshot,
  screenshotBusy,
}: {
  copy: Copy;
  onPaste: () => void;
  onScreenshot: () => void;
  screenshotBusy: boolean;
}) {
  const c = copy.check;
  // Read on render rather than in state: the greeting only has to be right
  // when the screen is opened, and a timer here would be a re-render for
  // nothing. Local hours, because "morning" means the user's morning.
  const greeting = c.greeting(new Date().getHours());
  // Drifts a little slower than the page as it scrolls away.
  const heroRef = useParallax<HTMLElement>();

  return (
    <section ref={heroRef} className="hero parallax flex flex-col gap-3 px-[22px] pt-[22px] pb-5">
      <p className="text-[0.9375rem] font-semibold text-white/70">{greeting}</p>
      <h2 className="text-[2.625rem] leading-[2.875rem] font-bold tracking-[-0.02em] text-white">{c.question}</h2>
      <p className="text-[1.0625rem] leading-[1.4375rem] text-white/[0.72]">{c.heroLine}</p>

      <div className="mt-1.5 flex gap-2.5">
        <button type="button" onClick={onPaste} className="btn pressable grow bg-white text-[#111113]">
          <ClipboardIcon className="size-[19px]" />
          {c.paste}
        </button>
        <button
          type="button"
          onClick={onScreenshot}
          disabled={screenshotBusy}
          aria-busy={screenshotBusy}
          aria-label={c.screenshot}
          title={c.screenshot}
          className="pressable flex size-[50px] shrink-0 items-center justify-center rounded-full bg-white/[0.14] text-white disabled:opacity-50"
        >
          <ImageIcon className="size-[21px]" strokeWidth={1.9} />
        </button>
      </div>
    </section>
  );
}
