import type { Metadata } from "next";
import FraudReplay from "@/components/FraudReplay";

// Session-derived, per-check content, same as /result — not something to
// index or list in the sitemap (see app/sitemap.ts's note on /result).
export const metadata: Metadata = { title: "Fraud Replay", robots: { index: false } };

export default function ReplayPage() {
  return (
    <main>
      <FraudReplay />
    </main>
  );
}
