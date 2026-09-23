import type { Metadata } from "next";
import LandingHero from "@/components/landing/LandingHero";
import BadgeDivider from "@/components/landing/BadgeDivider";
import { ProblemSection, ApproachSection, CandidBreak, MauritiusSection, ChecksSection, GetItSection } from "@/components/landing/LandingSections";
import TeamSection from "@/components/landing/TeamSection";
import LandingFooter from "@/components/landing/LandingFooter";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "FraudLens AI: catch the scam before you pay" },
  description:
    "FraudLens AI checks suspicious messages, links, websites and emails before you pay, built for Mauritius in English, French and Kreol. By Dhruv & Friends.",
  alternates: { canonical: "/" },
};

// The project's front door: what FraudLens is, the three ways in, why it is
// built for Mauritius, how to install each client, and the team. Full-bleed;
// SideNav and TabBar step aside on this route. The web app itself is /app.
export default function LandingPage() {
  return (
    <div className="landing">
      <LandingHero />
      <BadgeDivider />
      <main>
        <ProblemSection />
        <ApproachSection />
        <CandidBreak />
        <MauritiusSection />
        <ChecksSection />
        <GetItSection />
        <TeamSection />
      </main>
      <LandingFooter />
    </div>
  );
}
