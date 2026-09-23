import type { Metadata } from "next";
import PrivacyScreen from "@/components/landing/PrivacyScreen";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <main>
      <PrivacyScreen />
    </main>
  );
}
