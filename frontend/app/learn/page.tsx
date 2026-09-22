import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import PlaceholderScreen from "@/components/PlaceholderScreen";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return (
    <main className="flex flex-col gap-8">
      <AppHeader />
      <PlaceholderScreen page="learn" />
    </main>
  );
}
