import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/** Shared chrome copy (top bar, tab bar, common labels), one JSON file per language. */
export type DcCopy = typeof en;
const FILES: Record<UiLanguage, DcCopy> = { en, fr: fr as DcCopy, kreol: kreol as DcCopy };
export const dcCopy = (lang: UiLanguage): DcCopy => FILES[lang] ?? en;
