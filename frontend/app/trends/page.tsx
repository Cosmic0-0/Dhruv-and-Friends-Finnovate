import type { Metadata } from "next";
import TrendsContent from "@/components/TrendsContent";

export const metadata: Metadata = { title: "Trends", alternates: { canonical: "/trends" } };

export default function TrendsPage() {
  return (
    <main>
        <TrendsContent />
    </main>
  );
}
