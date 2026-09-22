import type { Metadata } from "next";
import ResultView from "@/components/ResultView";

export const metadata: Metadata = { title: "Result", robots: { index: false } };

export default function ResultPage() {
  return (
    <main>
      <ResultView />
    </main>
  );
}
