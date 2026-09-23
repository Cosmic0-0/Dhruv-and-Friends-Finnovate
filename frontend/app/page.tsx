import AppHeader from "@/components/AppHeader";
import CheckForm from "@/components/CheckForm";
import IntelligenceTools from "@/components/IntelligenceTools";
import Hero from "@/components/Hero";
import RecentChecks from "@/components/RecentChecks";
import { T } from "@/components/LanguageProvider";
import { SendIcon } from "@/components/icons";

const JSON_LD = {
  "@context": "https://schema.org", "@type": "WebApplication",
  name: "FraudLens AI", applicationCategory: "SecurityApplication", operatingSystem: "Any",
  description: "Paste a suspicious SMS or message and see the scam warning signs: sender mismatch, urgency, lookalike links. Built for Mauritius, in English, French and Kreol.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function CheckPage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <AppHeader />
      <div className="gutter flex flex-col gap-8 pt-6 md:gap-10 md:pt-8">
        <div className="grid items-stretch border border-card-border bg-card lg:grid-cols-[0.95fr_1.05fr]">
          <Hero />
          <section id="check-message" className="flex scroll-mt-6 flex-col justify-center gap-5 p-5 md:p-7">
            <div className="flex flex-col gap-3">
              <h2 className="text-[1.875rem] leading-tight"><T k="headline" /></h2>
              <p className="max-w-[46ch] text-sm leading-relaxed text-ink-soft"><T k="subline" /></p>
            </div>
            <CheckForm />
          </section>
        </div>
        <IntelligenceTools />
        <RecentChecks />
        <p className="flex items-center gap-2.5 border-t border-card-border pt-4 text-[0.8125rem] text-ink-muted">
          <SendIcon className="size-4 shrink-0" /><span><T k="telegram" /></span>
        </p>
      </div>
    </main>
  );
}
