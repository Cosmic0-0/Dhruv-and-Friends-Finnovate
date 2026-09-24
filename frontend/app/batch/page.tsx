import type { Metadata } from "next";
import BatchScreen from "@/components/batch/BatchScreen";

export const metadata: Metadata = { title: "Batch scan", alternates: { canonical: "/batch" } };

export default function BatchPage() {
  return (
    <main>
      <BatchScreen />
    </main>
  );
}
