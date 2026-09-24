import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/** Conversation copy, one JSON file per UI language (Kreol is an unreviewed draft). */
export type ConversationCopy = typeof en;
const FILES: Record<UiLanguage, ConversationCopy> = { en, fr: fr as ConversationCopy, kreol: kreol as ConversationCopy };
export const conversationCopy = (lang: UiLanguage): ConversationCopy => FILES[lang] ?? en;

export const fill = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
