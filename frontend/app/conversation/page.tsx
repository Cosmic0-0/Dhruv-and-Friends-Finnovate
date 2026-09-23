import type { Metadata } from "next";
import ConversationScreen from "@/components/conversation/ConversationScreen";

export const metadata: Metadata = { title: "Conversation analysis", alternates: { canonical: "/conversation" } };

export default function ConversationPage() {
  return (
    <main>
      <ConversationScreen />
    </main>
  );
}
