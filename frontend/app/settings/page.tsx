import type { Metadata } from "next";
import SettingsScreen from "@/components/SettingsScreen";

export const metadata: Metadata = { title: "Settings", alternates: { canonical: "/settings" } };

export default function SettingsPage() {
  return (
    <main>
      <SettingsScreen />
    </main>
  );
}
