import type { Metadata } from "next";
import ReportScreen from "@/components/report/ReportScreen";

export const metadata: Metadata = { title: "Report a scam", alternates: { canonical: "/report" } };

export default function ReportPage() {
  return (
    <main>
      <ReportScreen />
    </main>
  );
}
