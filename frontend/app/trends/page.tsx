import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import TrendsContent from "@/components/TrendsContent";

export const metadata: Metadata = { title: "Trends", alternates: { canonical: "/trends" } };

export default function TrendsPage() {
  return (
    <main className="flex flex-col gap-8">
      <AppHeader />
      <TrendsContent />
    </main>
  );
}
