import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import LearnScreen from "@/components/learn/LearnScreen";
import { loadLearnContent } from "@/lib/learn-data";

export const metadata: Metadata = { title: "Learn", alternates: { canonical: "/learn" } };

// Server component: reads the Kreol scam corpus at build time and bakes it
// into this static page, so the quiz needs no backend and works offline.
export default function LearnPage() {
  const { items, trends } = loadLearnContent();
  return (
    <main>
      <AppHeader />
      <div className="gutter pt-7">
        <LearnScreen items={items} trends={trends} />
      </div>
    </main>
  );
}
