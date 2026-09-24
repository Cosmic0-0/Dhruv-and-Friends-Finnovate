import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/** Radar copy, one JSON file per UI language. `{x}` placeholders are filled with fill(). */
export type RadarCopy = typeof en;
const FILES: Record<UiLanguage, RadarCopy> = { en, fr: fr as RadarCopy, kreol: kreol as RadarCopy };
export const radarCopy = (lang: UiLanguage): RadarCopy => FILES[lang] ?? en;
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
/** Safe lookup for a scam type or channel code that may not be in the (fixed) label dictionary yet. */
export const label = (dict: Record<string, string>, key: string): string => dict[key] ?? key;
