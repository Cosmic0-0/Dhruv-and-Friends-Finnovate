import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";
import ConversationFlow from "@/components/ConversationFlow";

export const metadata: Metadata = { title: "Conversation analysis", alternates: { canonical: "/conversation" } };

export default function ConversationPage() {
  return <main><AppHeader /><ConversationFlow /></main>;
}
