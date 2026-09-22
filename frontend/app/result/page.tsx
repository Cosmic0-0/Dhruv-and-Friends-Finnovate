import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ResultView from "@/components/ResultView";

export const metadata: Metadata = { title: "Result", robots: { index: false } };

export default function ResultPage() {
  return (
    <main className="flex flex-col gap-8">
      <AppHeader />
      <ResultView />
    </main>
  );
}
