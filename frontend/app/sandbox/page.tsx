import type { Metadata } from "next";
import SandboxScreen from "@/components/sandbox/SandboxScreen";

export const metadata: Metadata = { title: "Scam sandbox", alternates: { canonical: "/sandbox" } };

export default function SandboxPage() {
  return (
    <main>
      <SandboxScreen />
    </main>
  );
}
