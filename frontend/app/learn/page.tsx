import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import LearnContent from "@/components/LearnContent";

export const metadata: Metadata = { title: "Learn", alternates: { canonical: "/learn" } };

export default function LearnPage() {
  return (
    <main>
      <AppHeader />
      <div className="gutter pt-7">
        <LearnContent />
      </div>
    </main>
  );
}
