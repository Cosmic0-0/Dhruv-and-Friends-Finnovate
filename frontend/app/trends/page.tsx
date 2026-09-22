import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import PlaceholderScreen from "@/components/PlaceholderScreen";

export const metadata: Metadata = { title: "Trends" };

export default function TrendsPage() {
  return (
    <main className="flex flex-col gap-8">
      <AppHeader />
      <PlaceholderScreen page="trends" />
    </main>
  );
}
