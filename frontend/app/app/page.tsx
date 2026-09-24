import type { Metadata } from "next";
import { Suspense } from "react";
import CheckScreen from "@/components/check/CheckScreen";

// Without its own canonical, /app inherited the root layout's "/" and told
// search engines it was a duplicate of the landing page.
export const metadata: Metadata = { alternates: { canonical: "/app" } };

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
