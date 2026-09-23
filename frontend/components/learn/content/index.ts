import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/** Learn's own copy (the new dc-styled elements only; the quiz itself still reuses copy.learn from lib/i18n.ts). */
export type LearnCopy = typeof en;
const FILES: Record<UiLanguage, LearnCopy> = { en, fr: fr as LearnCopy, kreol: kreol as LearnCopy };
export const learnCopy = (lang: UiLanguage): LearnCopy => FILES[lang] ?? en;
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
