import Link from "next/link";
import IntelligenceNav from "./IntelligenceNav";
import DesktopNav from "./DesktopNav";
import LanguageSwitch from "./LanguageSwitch";
import { ShieldIcon } from "./icons";

/**
 * Dark instrument band. Anchors the app column with a real surface change
 * rather than a hairline under a wordmark, and carries the one persistent
 * status line (what the tool reads, and in which languages) so the page body
 * never has to explain itself.
 */
export default function AppHeader() {
  return (
    <header className="bg-ink text-on-ink pt-[env(safe-area-inset-top)]">
      <div className="gutter flex items-center justify-between gap-4 py-3.5">
        <Link
          href="/"
          aria-label="FraudLens home"
          className="pressable flex items-center gap-2.5 hover:opacity-80"
        >
          <ShieldIcon className="size-[19px] shrink-0 text-accent" strokeWidth={2} />
          <span className="font-heading text-[1.3125rem] leading-none font-semibold tracking-[0.01em] uppercase">
            Fraud<span className="text-accent">Lens</span>
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <DesktopNav />
          <LanguageSwitch />
        </div>
      </div>
      <div className="gutter border-t border-white/10 py-2">
        <p className="micro text-on-ink/45">Scam &amp; phishing detector · Mauritius</p>
      </div>
      <IntelligenceNav />
    </header>
  );
}
