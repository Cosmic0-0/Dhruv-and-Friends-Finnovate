import { Suspense } from "react";
import CheckScreen from "@/components/check/CheckScreen";

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
      {/* CheckScreen reads ?scan= / ?new=1 via useSearchParams. */}
      <Suspense fallback={null}>
        <CheckScreen />
      </Suspense>
    </main>
  );
}
