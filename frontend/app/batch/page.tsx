import type { Metadata } from "next";
import BatchScreen from "@/components/batch/BatchScreen";

export const metadata: Metadata = { title: "Batch scan · FraudLens", alternates: { canonical: "/batch" } };

export default function BatchPage() {
  return (
    <main>
      <BatchScreen />
    </main>
  );
}
