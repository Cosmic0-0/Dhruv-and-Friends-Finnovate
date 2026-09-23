import AppHeader from "@/components/AppHeader";
import BatchScan from "@/components/BatchScan";

export const metadata = { title: "Batch scan · FraudLens" };

export default function BatchPage() {
  return (
    <main>
      <AppHeader />
      <BatchScan />
    </main>
  );
}
