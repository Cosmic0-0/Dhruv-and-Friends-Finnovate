import type { Metadata } from "next";
import CreatedByScreen from "@/components/created-by/CreatedByScreen";

export const metadata: Metadata = { title: "Created by Dhruv & Friends", alternates: { canonical: "/created-by" } };

export default function CreatedByPage() {
  return (
    <main>
      <CreatedByScreen />
    </main>
  );
}
