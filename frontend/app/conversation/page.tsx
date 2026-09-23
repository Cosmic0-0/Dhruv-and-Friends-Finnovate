import type { Metadata } from "next";
import ConversationFlow from "@/components/ConversationFlow";

export const metadata: Metadata = { title: "Conversation analysis", alternates: { canonical: "/conversation" } };

export default function ConversationPage() {
  return <main><ConversationFlow /></main>;
}
