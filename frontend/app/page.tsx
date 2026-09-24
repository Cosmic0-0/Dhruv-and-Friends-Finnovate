import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: { absolute: "FraudLens AI: catch the scam before you pay" },
  description:
    "FraudLens AI checks suspicious messages, links, websites and emails before you pay, built for Mauritius in English, French and Kreol. By Dhruv & Friends.",
  alternates: { canonical: "/" },
};

// The front door (Landing.dc.html). It carries its own header, so the app's
// top bar and tab bar step aside on this route. The web app itself is /app.
export default function Page() {
  return <LandingPage />;
}
