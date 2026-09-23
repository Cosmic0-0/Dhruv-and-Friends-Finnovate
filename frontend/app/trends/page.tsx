import type { Metadata } from "next";
import RadarScreen from "@/components/radar/RadarScreen";

export const metadata: Metadata = { title: "Radar", alternates: { canonical: "/trends" } };

export default function TrendsPage() {
  return (
    <main>
      <RadarScreen />
    </main>
  );
}
// touch 1790202907
