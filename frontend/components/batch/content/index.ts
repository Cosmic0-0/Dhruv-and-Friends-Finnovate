import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/** Batch scan copy, one JSON file per UI language (Kreol is an unreviewed draft). */
export type BatchCopy = typeof en;
const FILES: Record<UiLanguage, BatchCopy> = { en, fr: fr as BatchCopy, kreol: kreol as BatchCopy };
export const batchCopy = (lang: UiLanguage): BatchCopy => FILES[lang] ?? en;

/** "{n} / {max}" style templates. */
export const fill = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
