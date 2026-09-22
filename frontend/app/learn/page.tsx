import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import LearnContent from "@/components/LearnContent";

export const metadata: Metadata = { title: "Learn", alternates: { canonical: "/learn" } };

export default function LearnPage() {
  return (
    <main className="flex flex-col gap-8">
      <AppHeader />
      <LearnContent />
    </main>
  );
}
