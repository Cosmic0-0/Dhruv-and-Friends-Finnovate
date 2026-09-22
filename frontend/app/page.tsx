import AppHeader from "@/components/AppHeader";
import CheckForm from "@/components/CheckForm";
import RecentChecks from "@/components/RecentChecks";
import { T } from "@/components/LanguageProvider";
import { SendIcon } from "@/components/icons";

// Static app description for crawlers/link previews - not user-controlled
// input, so a plain JSON-LD <script> is safe here (see checklist.md: only
// user-submitted content needs escaping, and this isn't that).
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "FraudLens AI",
  applicationCategory: "SecurityApplication",
  operatingSystem: "Any",
  description:
    "Paste a suspicious SMS or message and see the scam warning signs: sender mismatch, urgency, lookalike links. Built for Mauritius, in English, French and Kreol.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

// Server component: only the pieces that need state (language switch, form,
// recent checks) are client components.
export default function CheckPage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <AppHeader />

      <div className="gutter flex flex-col gap-7 pt-7">
        <section className="flex flex-col gap-3">
          <h1>
            <T k="headline" />
          </h1>
          <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-ink-soft">
            <T k="subline" />
          </p>
        </section>

        <CheckForm />

        <p className="flex items-center gap-2.5 border-t border-card-border pt-4 text-[0.8125rem] text-ink-muted">
          <SendIcon className="size-4 shrink-0" />
          <span>
            <T k="telegram" />
          </span>
        </p>

        <RecentChecks />
      </div>
    </main>
  );
}
