import type { Metadata } from "next";
import ExtensionScreen from "@/components/landing/ExtensionScreen";

export const metadata: Metadata = { title: "Browser extension", alternates: { canonical: "/extension" } };

export default function ExtensionPage() {
  return (
    <main>
      <ExtensionScreen />
    </main>
  );
}
