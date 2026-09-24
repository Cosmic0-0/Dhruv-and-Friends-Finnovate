import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/** "Check a document" shell copy (not already in lib/i18n.ts's DocumentCopy). Kreol is an unreviewed draft. */
export type Content = typeof en;
const FILES: Record<UiLanguage, Content> = { en, fr: fr as Content, kreol: kreol as Content };
export const content = (lang: UiLanguage): Content => FILES[lang] ?? en;
