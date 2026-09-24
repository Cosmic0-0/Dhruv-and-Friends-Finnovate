import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/** Check / result copy, one JSON file per UI language (Kreol is an unreviewed draft). */
export type CheckCopy = typeof en;
const FILES: Record<UiLanguage, CheckCopy> = { en, fr: fr as CheckCopy, kreol: kreol as CheckCopy };
export const checkCopy = (lang: UiLanguage): CheckCopy => FILES[lang] ?? en;

/** "{n} links" style templates. */
export const fill = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
